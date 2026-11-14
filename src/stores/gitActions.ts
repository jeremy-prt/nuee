import { defineStore } from 'pinia'
import { reactive, unref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import type { HeadInfo } from '@/ipc/bindings/HeadInfo'
import { isAppError } from '@/ipc/agent'
import { worktreeCommit, worktreeCommitMessage, worktreeHead, worktreePull, worktreePush } from '@/ipc/worktree'
import { type Signal, useAttentionStore } from '@/stores/attention'
import { useCatalogStore } from '@/stores/catalog'
import { type ChatItem, type Conversation, type GitItem, useConversationsStore } from '@/stores/conversations'
import { useGitPanelStore } from '@/stores/gitPanel'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useSkillsStore } from '@/stores/skills'
import { useToastsStore } from '@/stores/toasts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'

// `message` : écrire le titre du commit des changements, sans commiter (bouton du champ de message du volet Git).
export type GitAction = 'ship' | 'commitPush' | 'commit' | 'push' | 'initRepo' | 'message'

// Seules actions encore faites par un agent : écrire le message (Haiku, aux règles du skill de commit de
// l'utilisateur, lu sans être lancé) et créer le dépôt. Commit, push et pull sont faits par l'app (demande de Jérémy :
// ses skills s'invoquent dans la conversation). `ship` et `commitPush` restent pour les séparateurs déjà enregistrés.
export type AgentAction = Extract<GitAction, 'message' | 'initRepo'>
const SKILL_WORDS: Record<AgentAction, readonly string[]> = {
  initRepo: ['init', 'repo'],
  message: ['commit'],
}

// Dernière ligne de texte de la réponse, sans guillemets ni balises de code : le titre demandé.
export interface GitRun {
  action: AgentAction
  folder: string
  projectId: string
  originId: string
  chatId: string
  // Date.now() au lancement, pour le temps écoulé sur le bouton.
  startedAt: number
  // Session rendue visible (question, autorisation) : l'action continue, l'utilisateur y répond.
  revealed: boolean
  // `message` : le champ au lancement. Changé depuis, le titre généré ne l'écrase pas.
  draft: string
  // `message` lancé par Commit champ vide : le titre écrit sert aussitôt au commit, sans passer par le champ.
  commitAfter: boolean
}

// Erreur brute d'un échec : ses deux premières lignes, le reste se lit dans la session.
function brief(error: string) {
  return error
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
}

// Familles de modèles pour les actions de fond, de la moins chère à la plus chère.
const CHEAP = ['haiku', 'sonnet'] as const
const EFFORT_ORDER: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// Actions git d'un clic, comme T3 Code : commit, push et pull faits par l'app ; seuls le message de commit et la
// création du dépôt passent par une session cachée, qui n'apparaît que si elle attend l'utilisateur ou échoue.
// Réussie, elle est supprimée et le fil d'origine garde un séparateur. Une action à la fois par dossier.
export const useGitActionsStore = defineStore('gitActions', () => {
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const catalog = useCatalogStore()
  const projects = useProjectsStore()
  const sessionGit = useSessionGitStore()
  const skills = useSkillsStore()
  const toasts = useToastsStore()

  // Par dossier de travail.
  const runs = reactive(new Map<string, GitRun>())
  // Dossiers où l'app commite ou pousse elle-même (commit direct du volet Git) : aucune action de fond n'y démarre.
  const manual = reactive(new Set<string>())
  // Compteur par dossier, augmenté à chaque fin d'action : le volet Git s'y relit.
  const settled = reactive<Record<string, number>>({})
  const watchers = new Map<string, () => void>()

  function folderOf(tab: Tab | null | undefined) {
    const project = projects.byId(tab?.projectId ?? null)
    if (!tab || !project) return null
    return tab.worktree ? tab.worktreePath : project.path
  }

  function runOf(tab: Tab | null | undefined) {
    const folder = folderOf(tab)
    return folder ? (runs.get(folder) ?? null) : null
  }

  function skillOf(action: AgentAction, agent: AgentKind) {
    return skills.actionSkill(agent, SKILL_WORDS[action])
  }

  function label(action: GitAction) {
    const { t } = i18nGlobal()
    return t(`gitActions.labels.${action}`)
  }

  function open(chatId: string) {
    const tab = workspace.tabs.find((item) => item.id === chatId)
    if (!tab) return
    useNavigationStore().openChats(tab.projectId)
    workspace.show(tab.id)
  }

  async function start(action: AgentAction, origin: Tab, commitAfter = false) {
    const { t } = i18nGlobal()
    const folder = folderOf(origin)
    const project = projects.byId(origin.projectId)
    if (!folder || !project || !origin.started) return false
    // Sans les réglages de l'origine, la session de fond prendrait ceux du projet, peut-être plus larges.
    const source = conversations.find(origin.id)
    if (!source?.loaded) {
      toasts.push({ title: t('gitActions.notReadyTitle', { action: label(action) }), body: t('gitActions.notReady') })
      return false
    }
    const busy = runs.get(folder)
    if (busy || manual.has(folder)) {
      toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: busy ? label(busy.action) : t('gitActions.direct') }) })
      return false
    }
    // Réservé avant d'attendre la liste des skills : un double clic ne lance pas deux actions.
    const draft = useGitPanelStore().of(origin.id).message
    const run: GitRun = { action, folder, projectId: project.id, originId: origin.id, chatId: '', startedAt: Date.now(), revealed: false, draft, commitAfter }
    runs.set(folder, run)
    // Relue à chaque action, comme le menu « / » : un skill ajouté entre-temps est vu.
    await skills.loadSkills()
    const skill = skillOf(action, origin.agent)
    if (action === 'message') return writeMessage(run, origin, project.path, skill?.path ?? null)
    const prompt = skill ? `/${skill.name} ${t('gitActions.go')}` : t('gitActions.prompts.initRepo')
    const worktreePath = origin.worktree ? origin.worktreePath : undefined
    const tab = workspace.addChat(origin.projectId, label(action), worktreePath, origin.id, { agent: origin.agent })
    // Même mode d'autorisation que la session d'origine, jamais plus large.
    conversations.setOptions(tab.id, { ...source.options, ...economy(origin.agent) })
    workspace.startChat(tab.id, prompt, [])
    const place = { cwd: project.path, worktree: tab.worktree, worktreePath: tab.worktreePath, worktreeBase: null }
    conversations.send(tab.id, place, prompt, [])
    const live = runs.get(folder)
    if (!live) return false
    live.chatId = tab.id
    follow(live)
    return true
  }

  // Un seul appel sans outils, sur le diff lu par l'app : une session complète repayait tout le prompt de l'agent
  // pour une ligne. Arrêtée entre-temps (`stop`), la réponse est ignorée.
  async function writeMessage(run: GitRun, origin: Tab, projectPath: string, skill: string | null) {
    const { t, locale } = i18nGlobal()
    let message: string | null = null
    let error = ''
    try {
      message = await worktreeCommitMessage(origin.id, projectPath, origin.agent, unref(locale), skill)
    } catch (caught) {
      error = brief(isAppError(caught) ? caught.message : String(caught))
    }
    // `runs` est réactive : comparer l'action rangée par sa date de lancement, pas par identité d'objet.
    const live = runs.get(run.folder)
    if (live?.startedAt !== run.startedAt) return false
    end(live)
    if (!message) {
      toasts.push({ kind: 'error', title: t('gitActions.failed', { action: label('message') }), body: error || t('gitActions.failedBody'), clamp: !!error })
      return false
    }
    if (run.commitAfter) return commitNow(origin, message)
    const gitPanel = useGitPanelStore()
    const typed = gitPanel.of(run.originId).message
    if (!typed.trim() || typed === run.draft) gitPanel.setMessage(run.originId, message)
    return true
  }

  // Écrire un message ou créer un dépôt suit une procédure : le modèle le moins cher du moment suffit, en effort bas.
  function economy(agent: AgentKind) {
    const models = catalog.get(agent)?.models.filter((model) => !model.legacy) ?? []
    // L'alias exact d'abord : un libellé « Sonnet (1M context) » viendrait sinon avant `sonnet`.
    const pick = (family: string) => models.find((model) => model.value === family) ?? models.find((model) => model.label.toLowerCase().startsWith(family))
    const cheap = CHEAP.map(pick).find(Boolean)
    if (!cheap) return {}
    const effort = EFFORT_ORDER.find((level) => cheap.efforts.includes(level)) ?? null
    return { model: cheap.value, effort, fast: false }
  }

  function follow(run: GitRun) {
    const stop = watch(
      () => {
        const conversation = conversations.find(run.chatId)
        return [conversation, conversation?.phase, conversation?.approvals.length] as const
      },
      ([conversation]) => {
        if (!conversation) return end(run)
        if (conversation.approvals.length && !run.revealed) waiting(run, conversation)
        if (conversation.phase === 'idle') finish(run, conversation)
      },
      { immediate: true },
    )
    watchers.set(run.folder, stop)
  }

  function end(run: GitRun) {
    watchers.get(run.folder)?.()
    watchers.delete(run.folder)
    if (runs.get(run.folder)?.chatId === run.chatId) runs.delete(run.folder)
    settled[run.folder] = (settled[run.folder] ?? 0) + 1
  }

  // La session devient visible sous celle d'origine, avec un message qui la fait ouvrir.
  // `sticky` : la session attend l'utilisateur, le message reste jusqu'à ce qu'il l'ouvre ou le ferme.
  // Textes des messages toujours écrits par l'app, jamais repris de l'agent (choix de Jérémy). `clamp` : erreur brute.
  function reveal(run: GitRun, kind: Signal, title: string, body: string, options: { sticky?: boolean; clamp?: boolean } = {}) {
    workspace.reveal(run.chatId)
    run.revealed = true
    const { t } = i18nGlobal()
    toasts.push({ kind: kind === 'failed' ? 'error' : kind === 'done' ? 'info' : 'warning', title, body, topic: run.chatId, ...options, action: { label: t('attention.open'), run: () => open(run.chatId) } })
    useAttentionStore().away(run.chatId, kind, title, body, true)
  }

  function waiting(run: GitRun, conversation: Conversation) {
    const { t } = i18nGlobal()
    const kind = conversation.approvals[0]?.questions?.length ? 'question' : 'approval'
    reveal(run, kind, t(`gitActions.${kind}`), t('gitActions.actionBody', { action: label(run.action) }), { sticky: true })
  }

  async function finish(run: GitRun, conversation: Conversation) {
    watchers.get(run.folder)?.()
    watchers.delete(run.folder)
    const { t } = i18nGlobal()
    const items = conversation.items
    const last = items.at(-1)
    const action = label(run.action)
    const done = await achieved(run)
    end(run)
    // Révélée, la session est une session comme une autre : la fin de son tour prévient par le chemin habituel.
    if (run.revealed) return
    if (last?.kind === 'error' || (last?.kind === 'end' && (last.status === 'failed' || last.status === 'unauthenticated'))) {
      const error = brief((last.kind === 'error' ? last.error.message : last.error) ?? '')
      return reveal(run, 'failed', t('gitActions.failed', { action }), error || t('gitActions.failedBody'), { clamp: !!error })
    }
    if (last?.kind === 'end' && last.status === 'stopped') {
      // Rien d'entamé : la session n'a rien à montrer.
      if (!items.some((item) => item.kind === 'tool')) {
        toasts.push({ title: t('gitActions.stopped', { action }), body: t('gitActions.stoppedEmpty') })
        return workspace.deleteChat(run.chatId)
      }
      return reveal(run, 'done', t('gitActions.stopped', { action }), t('gitActions.stoppedBody'))
    }
    // Tour fini sans le résultat attendu : souvent une question posée en texte, à laquelle répondre dans la session.
    if (!done) return reveal(run, 'failed', t('gitActions.unfinished', { action }), t('gitActions.unfinishedBody'), { sticky: true })
    const head = await headOf(run)
    const title = t(`gitActions.done.${run.action}`)
    const body = (run.action === 'initRepo' ? head?.origin : [head?.subject, head?.branch].filter(Boolean).join(' · ')) ?? ''
    toasts.push({ kind: 'success', title, body })
    useAttentionStore().away(run.originId, 'done', title, body)
    mark(run.originId, run.action, head)
    await workspace.deleteChat(run.chatId)
  }

  // Commit direct, fait par l'app (`worktree_commit`) : pas d'agent, pas de skill.
  // Refusé pendant une action de fond dans le même dossier, qui refuse à son tour de démarrer pendant ce temps.
  async function commitNow(origin: Tab, message: string) {
    const { t } = i18nGlobal()
    const folder = folderOf(origin)
    const project = projects.byId(origin.projectId)
    if (!folder || !project || !origin.started || !message.trim() || manual.has(folder)) return false
    const busy = runs.get(folder)
    if (busy) {
      toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: label(busy.action) }) })
      return false
    }
    manual.add(folder)
    try {
      let head: HeadInfo
      try {
        const done = await worktreeCommit(origin.id, project.path, message)
        head = done.head
        if (done.skipped.length)
          toasts.push({ title: t('dock.changes.nestedOut', { n: done.skipped.length }, done.skipped.length), body: done.skipped.join('\n') })
      } catch (error) {
        toasts.push({ kind: 'error', title: t('gitActions.directFailed'), body: brief(isAppError(error) ? error.message : String(error)), clamp: true })
        return false
      }
      useGitPanelStore().setMessage(origin.id, '')
      toasts.push({ kind: 'success', title: t('gitActions.done.commit'), body: [head.subject, head.branch].filter(Boolean).join(' · ') })
      mark(origin.id, 'commit', head)
      return true
    } finally {
      manual.delete(folder)
      settled[folder] = (settled[folder] ?? 0) + 1
      await sessionGit.refresh(origin.id, project.path)
    }
  }

  // Push direct, jamais forcé : mêmes garde-fous que le commit direct.
  async function pushNow(origin: Tab) {
    const { t } = i18nGlobal()
    const folder = folderOf(origin)
    const project = projects.byId(origin.projectId)
    if (!folder || !project || manual.has(folder)) return
    const busy = runs.get(folder)
    if (busy) return void toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: label(busy.action) }) })
    manual.add(folder)
    try {
      const head = await worktreePush(origin.id, project.path)
      toasts.push({ kind: 'success', title: t('gitActions.done.push'), body: [head.subject, head.branch].filter(Boolean).join(' · ') })
      mark(origin.id, 'push', head)
    } catch (error) {
      toasts.push({ kind: 'error', title: t('gitActions.pushFailed'), body: brief(isAppError(error) ? error.message : String(error)), clamp: true })
    } finally {
      manual.delete(folder)
      settled[folder] = (settled[folder] ?? 0) + 1
      await sessionGit.refresh(origin.id, project.path)
    }
  }

  // Pull direct, sans agent ni skill (demande de Jérémy) : mêmes garde-fous que le commit direct.
  async function pullNow(origin: Tab) {
    const { t } = i18nGlobal()
    const folder = folderOf(origin)
    const project = projects.byId(origin.projectId)
    if (!folder || !project || manual.has(folder)) return
    const busy = runs.get(folder)
    if (busy) return void toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: label(busy.action) }) })
    manual.add(folder)
    try {
      const head = await worktreePull(origin.id, project.path)
      toasts.push({ kind: 'success', title: t('gitActions.done.pull'), body: [head.subject, head.branch].filter(Boolean).join(' · ') })
    } catch (error) {
      toasts.push({ kind: 'error', title: t('gitActions.pullFailed'), body: brief(isAppError(error) ? error.message : String(error)), clamp: true })
    } finally {
      manual.delete(folder)
      settled[folder] = (settled[folder] ?? 0) + 1
      await Promise.all([sessionGit.refresh(origin.id, project.path), sessionGit.checkBehind(origin.id, project.path, true)])
    }
  }

  async function headOf(run: GitRun) {
    const project = projects.byId(run.projectId)
    return project ? worktreeHead(run.originId, project.path).catch(() => null) : null
  }

  // Séparateur dans le fil d'origine, posé entre deux tours : en plein tour, le texte en flux de l'agent s'ajoute au
  // dernier élément. Son agent l'apprend au message suivant (`conversations.gitNote`).
  function mark(originId: string, action: GitAction, head: HeadInfo | null) {
    const tab = workspace.tabs.find((item) => item.id === originId)
    if (!tab) return
    conversations.open(tab.id, tab.agent, tab.projectId)
    const item: GitItem = { kind: 'git', id: crypto.randomUUID(), at: Date.now(), action, subject: head?.subject ?? null, branch: head?.branch ?? null, repo: head?.origin ?? null }
    let handled = false
    // Hors de tout scope : arrêté à la pose, ou quand la session d'origine disparaît avant.
    const stop = watch(
      () => {
        if (!workspace.tabs.some((other) => other.id === tab.id)) return 'gone'
        const conversation = conversations.find(tab.id)
        return conversation?.loaded && conversation.phase === 'idle' ? 'ready' : 'waiting'
      },
      (state) => {
        if (state === 'waiting' || handled) return
        handled = true
        if (state === 'ready') conversations.note(tab.id, item)
        queueMicrotask(() => stop())
      },
      { immediate: true },
    )
  }

  // L'agent dit avoir fini : l'état git le confirme. Pendant que l'agent d'origine travaille, de nouvelles
  // modifications peuvent arriver après le commit : seul le push compte alors.
  async function achieved(run: GitRun) {
    const project = projects.byId(run.projectId)
    if (!project) return true
    if (run.action === 'initRepo') {
      await projects.checkWorktree(project)
      const created = projects.support[project.id] !== 'notRepo'
      // Le dépôt vient de naître : la branche et le reste de l'état git se lisent maintenant, pas au prochain tour.
      if (created) await Promise.all([useWorktreesStore().load(project), sessionGit.refresh(run.originId, project.path)])
      return created
    }
    return true
  }

  function stop(run: GitRun) {
    // Le message s'écrit sans session : rien à arrêter, sa réponse sera ignorée.
    if (!run.chatId) return end(run)
    conversations.stop(run.chatId)
  }

  return { runs, manual, settled, folderOf, runOf, skillOf, label, start, commitNow, pushNow, pullNow, stop, open }
})
