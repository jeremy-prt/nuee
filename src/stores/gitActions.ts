import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import type { HeadInfo } from '@/ipc/bindings/HeadInfo'
import { isAppError } from '@/ipc/agent'
import { worktreeCommit, worktreeHead, worktreePush } from '@/ipc/worktree'
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

// Mots cherchés dans le nom des skills de l'utilisateur. null : toujours la consigne générique (« Commiter sans
// pousser » : le skill de commit de Jérémy pousse aussi). Le skill de `message` n'est jamais lancé, seulement lu.
const SKILL_WORDS: Record<GitAction, readonly string[] | null> = {
  ship: ['ship'],
  commitPush: ['commit'],
  commit: null,
  push: null,
  initRepo: ['init', 'repo'],
  message: ['commit'],
}

// Dernière ligne de texte de la réponse, sans guillemets ni balises de code : le titre demandé.
function titleOf(items: readonly ChatItem[]) {
  const text = items.filter((item): item is Extract<ChatItem, { kind: 'text' }> => item.kind === 'text').at(-1)?.text ?? ''
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('```'))
    .at(-1)
  return line?.replace(/^[`"'«“\s]+|[`"'»”\s]+$/g, '').slice(0, 200) || null
}

export interface GitRun {
  action: GitAction
  folder: string
  projectId: string
  originId: string
  chatId: string
  // Date.now() au lancement, pour le temps écoulé sur le bouton.
  startedAt: number
  // Session rendue visible (question, autorisation) : l'action continue, l'utilisateur y répond.
  revealed: boolean
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

// Actions git lancées d'un clic (Environnement, volet Git), comme T3 Code mais avec les skills de l'utilisateur :
// une session cachée, lancée dans le même dossier que celle d'origine, fait le travail. Elle n'apparaît (sous sa
// session d'origine) que si elle attend l'utilisateur ou n'aboutit pas ; réussie, elle est supprimée et le fil
// d'origine en garde un séparateur, que son agent apprend au message suivant. Une action à la fois par dossier.
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

  function skillOf(action: GitAction, agent: AgentKind) {
    const words = SKILL_WORDS[action]
    return words ? skills.actionSkill(agent, words) : null
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

  async function start(action: GitAction, origin: Tab) {
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
    const run: GitRun = { action, folder, projectId: project.id, originId: origin.id, chatId: '', startedAt: Date.now(), revealed: false }
    runs.set(folder, run)
    // Relue à chaque action, comme le menu « / » : un skill ajouté entre-temps est vu.
    await skills.loadSkills()
    const skill = skillOf(action, origin.agent)
    // Un skill de ship s'arrête avant de commiter tant qu'on ne lui a pas dit d'y aller : le clic vaut accord.
    const prompt =
      action === 'message'
        ? [t('gitActions.prompts.message'), skill ? t('gitActions.messageSkill', { path: skill.path }) : ''].filter(Boolean).join(' ')
        : skill
          ? `/${skill.name} ${t('gitActions.go')}`
          : t(`gitActions.prompts.${action}`)
    const worktreePath = origin.worktree ? origin.worktreePath : undefined
    const tab = workspace.addChat(origin.projectId, label(action), worktreePath, origin.id, { agent: origin.agent })
    // Même mode d'autorisation que la session d'origine, jamais plus large.
    conversations.setOptions(tab.id, { ...source.options, ...economy(action, origin.agent) })
    workspace.startChat(tab.id, prompt, [])
    const place = { cwd: project.path, worktree: tab.worktree, worktreePath: tab.worktreePath, worktreeBase: null }
    conversations.send(tab.id, place, prompt, [])
    const live = runs.get(folder)
    if (!live) return false
    live.chatId = tab.id
    follow(live)
    return true
  }

  // Commiter, pousser ou créer un dépôt suit une procédure : le modèle le moins cher du moment suffit, en effort
  // bas. Relire avant de pousser demande du jugement : la relecture garde le modèle de la session d'origine.
  function economy(action: GitAction, agent: AgentKind) {
    if (action === 'ship') return {}
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
    toasts.push({ kind: kind === 'failed' ? 'error' : 'info', title, body, topic: run.chatId, ...options, action: { label: t('attention.open'), run: () => open(run.chatId) } })
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
    const done = run.action === 'message' ? !!titleOf(items) : await achieved(run)
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
    if (!done) return reveal(run, 'done', t('gitActions.unfinished', { action }), t('gitActions.unfinishedBody'), { sticky: true })
    if (run.action === 'message') {
      useGitPanelStore().setMessage(run.originId, titleOf(items) ?? '')
      return workspace.deleteChat(run.chatId)
    }
    const head = await headOf(run)
    const title = t(`gitActions.done.${run.action}`)
    const body = (run.action === 'initRepo' ? head?.origin : [head?.subject, head?.branch].filter(Boolean).join(' · ')) ?? ''
    toasts.push({ kind: 'success', title, body })
    useAttentionStore().away(run.originId, 'done', title, body)
    mark(run.originId, run.action, head)
    await workspace.deleteChat(run.chatId)
  }

  // Commit direct du volet Git, fait par l'app (`worktree_commit`), puis push si demandé : pas d'agent, pas de skill.
  // Refusé pendant une action de fond dans le même dossier, qui refuse à son tour de démarrer pendant ce temps.
  async function commitNow(origin: Tab, message: string, push: boolean) {
    const { t } = i18nGlobal()
    const folder = folderOf(origin)
    const project = projects.byId(origin.projectId)
    if (!folder || !project || !message.trim() || manual.has(folder)) return false
    const busy = runs.get(folder)
    if (busy) {
      toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: label(busy.action) }) })
      return false
    }
    manual.add(folder)
    try {
      let head: HeadInfo
      try {
        head = await worktreeCommit(origin.id, project.path, message)
      } catch (error) {
        toasts.push({ kind: 'error', title: t('gitActions.directFailed'), body: brief(isAppError(error) ? error.message : String(error)), clamp: true })
        return false
      }
      useGitPanelStore().setMessage(origin.id, '')
      if (push) {
        try {
          head = await worktreePush(origin.id, project.path)
        } catch (error) {
          mark(origin.id, 'commit', head)
          toasts.push({ kind: 'error', title: t('gitActions.pushFailed'), body: brief(isAppError(error) ? error.message : String(error)), clamp: true })
          return true
        }
      }
      const action = push ? 'commitPush' : 'commit'
      toasts.push({ kind: 'success', title: t(`gitActions.done.${action}`), body: [head.subject, head.branch].filter(Boolean).join(' · ') })
      mark(origin.id, action, head)
      return true
    } finally {
      manual.delete(folder)
      settled[folder] = (settled[folder] ?? 0) + 1
      await sessionGit.refresh(origin.id, project.path)
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
    await sessionGit.refresh(run.originId, project.path)
    const git = sessionGit.states[run.originId]
    if (!git) return true
    const clean = git.changes.files === 0 || conversations.find(run.originId)?.phase !== 'idle'
    if (run.action === 'push') return !git.unpushed
    if (run.action === 'commit') return clean
    return clean && !git.unpushed
  }

  function stop(run: GitRun) {
    conversations.stop(run.chatId)
  }

  return { runs, manual, settled, folderOf, runOf, skillOf, label, start, commitNow, stop, open }
})
