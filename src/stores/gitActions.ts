import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { type Signal, useAttentionStore } from '@/stores/attention'
import { type ChatItem, type Conversation, useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useSkillsStore } from '@/stores/skills'
import { useToastsStore } from '@/stores/toasts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

export type GitAction = 'ship' | 'commitPush' | 'commit' | 'push' | 'initRepo'

// Mots cherchés dans le nom des skills de l'utilisateur. null : toujours la consigne générique (« Commiter sans
// pousser » : le skill de commit de Jérémy pousse aussi).
const SKILL_WORDS: Record<GitAction, readonly string[] | null> = {
  ship: ['ship'],
  commitPush: ['commit'],
  commit: null,
  push: null,
  initRepo: ['init', 'repo'],
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

const LAST_LINE = 160

// Dernière ligne utile de la réponse (souvent le titre du commit), sans la mise en forme markdown.
function lastLine(items: readonly ChatItem[]) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item?.kind !== 'text') continue
    const lines = item.text
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*>#]+\s*)+/, '').replace(/[*_`]/g, '').trim())
      .filter((line) => line && !/^[-|:\s]+$/.test(line))
    const line = lines.at(-1)
    if (line) return line.length > LAST_LINE ? `${line.slice(0, LAST_LINE - 1)}…` : line
  }
  return null
}

// Actions git lancées d'un clic (Environnement, Modifications), comme T3 Code mais avec les skills de l'utilisateur :
// une session cachée, lancée dans le même dossier que celle d'origine, fait le travail. Le fil d'origine ne reçoit rien.
// Elle n'apparaît (sous sa session d'origine) que si elle attend l'utilisateur ou n'aboutit pas ; réussie, elle est
// supprimée. Une action à la fois par dossier.
export const useGitActionsStore = defineStore('gitActions', () => {
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()
  const sessionGit = useSessionGitStore()
  const skills = useSkillsStore()
  const toasts = useToastsStore()

  // Par dossier de travail.
  const runs = reactive(new Map<string, GitRun>())
  // Compteur par dossier, augmenté à chaque fin d'action : le volet Modifications s'y relit.
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
    const busy = runs.get(folder)
    if (busy) {
      toasts.push({ title: t('gitActions.busyTitle'), body: t('gitActions.busy', { action: label(busy.action) }) })
      return false
    }
    // Réservé avant d'attendre la liste des skills : un double clic ne lance pas deux actions.
    const run: GitRun = { action, folder, projectId: project.id, originId: origin.id, chatId: '', startedAt: Date.now(), revealed: false }
    runs.set(folder, run)
    // Relue à chaque action, comme le menu « / » : un skill ajouté entre-temps est vu.
    await skills.loadSkills()
    const skill = skillOf(action, origin.agent)
    const prompt = skill ? `/${skill.name}` : t(`gitActions.prompts.${action}`)
    const options = conversations.find(origin.id)?.options
    const worktreePath = origin.worktree ? origin.worktreePath : undefined
    const tab = workspace.addChat(origin.projectId, label(action), worktreePath, origin.id, { agent: origin.agent })
    // Mêmes modèle, effort et mode d'autorisation que la session d'origine, jamais plus large.
    if (options) conversations.setOptions(tab.id, { ...options })
    workspace.startChat(tab.id, prompt, [])
    const place = { cwd: project.path, worktree: tab.worktree, worktreePath: tab.worktreePath, worktreeBase: null }
    conversations.send(tab.id, place, prompt, [])
    const live = runs.get(folder)
    if (!live) return false
    live.chatId = tab.id
    follow(live)
    return true
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
  function reveal(run: GitRun, kind: Signal, title: string, body: string, sticky = false) {
    workspace.reveal(run.chatId)
    run.revealed = true
    const { t } = i18nGlobal()
    toasts.push({ kind: kind === 'failed' ? 'error' : 'info', title, body, topic: run.chatId, sticky, action: { label: t('attention.open'), run: () => open(run.chatId) } })
    useAttentionStore().away(run.chatId, kind, title, body, true)
  }

  function waiting(run: GitRun, conversation: Conversation) {
    const { t } = i18nGlobal()
    const approval = conversation.approvals[0]
    const question = approval?.questions?.[0]?.prompt
    const kind = question !== undefined ? 'question' : 'approval'
    const body = question ?? approval?.description ?? approval?.detail ?? lastLine(conversation.items) ?? ''
    reveal(run, kind, t(`gitActions.${kind}`, { action: label(run.action) }), body, true)
  }

  async function finish(run: GitRun, conversation: Conversation) {
    watchers.get(run.folder)?.()
    watchers.delete(run.folder)
    const { t } = i18nGlobal()
    const items = conversation.items
    const last = items.at(-1)
    const action = label(run.action)
    const line = lastLine(items)
    const done = await achieved(run)
    end(run)
    // Révélée, la session est une session comme une autre : la fin de son tour prévient par le chemin habituel.
    if (run.revealed) return
    if (last?.kind === 'error' || (last?.kind === 'end' && (last.status === 'failed' || last.status === 'unauthenticated'))) {
      const error = last.kind === 'error' ? last.error.message : last.error
      return reveal(run, 'failed', t('gitActions.failed', { action }), error || line || '')
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
    if (!done) return reveal(run, 'done', t('gitActions.unfinished', { action }), line ?? t('gitActions.unfinishedBody'), true)
    const title = t(`gitActions.done.${run.action}`)
    const body = line ?? t('gitActions.doneBody')
    toasts.push({ kind: 'success', title, body })
    useAttentionStore().away(run.originId, 'done', title, body)
    await workspace.deleteChat(run.chatId)
  }

  // L'agent dit avoir fini : l'état git le confirme. Pendant que l'agent d'origine travaille, de nouvelles
  // modifications peuvent arriver après le commit : seul le push compte alors.
  async function achieved(run: GitRun) {
    const project = projects.byId(run.projectId)
    if (!project) return true
    if (run.action === 'initRepo') {
      await projects.checkWorktree(project)
      return projects.support[project.id] !== 'notRepo'
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

  return { runs, settled, folderOf, runOf, skillOf, label, start, stop, open }
})
