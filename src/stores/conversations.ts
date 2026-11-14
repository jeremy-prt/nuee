import { defineStore } from 'pinia'
import { computed, shallowReactive } from 'vue'
import { agentAnswer, agentApprove, agentRewind, agentSend, agentSteer, agentStop, agentStopTask, agentWarm, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AppError } from '@/ipc/bindings/AppError'
import type { Attachment } from '@/ipc/bindings/Attachment'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import type { ChatSummary } from '@/ipc/bindings/ChatSummary'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'
import type { FileChange } from '@/ipc/bindings/FileChange'
import type { SessionSpec } from '@/ipc/bindings/SessionSpec'
import type { TaskKind } from '@/ipc/bindings/TaskKind'
import type { TaskStatus } from '@/ipc/bindings/TaskStatus'
import type { ToolDetail } from '@/ipc/bindings/ToolDetail'
import type { ToolImage } from '@/ipc/bindings/ToolImage'
import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { TurnStatus } from '@/ipc/bindings/TurnStatus'
import { i18nGlobal } from '@/i18n'
import { attachmentSaveBase64 } from '@/ipc/attachment'
import { chatContent, chatCreate, chatDelete, chatSave } from '@/ipc/chat'
import { useAgentsStore } from '@/stores/agents'
import { type Signal, useAttentionStore } from '@/stores/attention'
import { useCatalogStore } from '@/stores/catalog'
import { useGeneralStore } from '@/stores/general'
import type { GitAction } from '@/stores/gitActions'
import { useNotesStore } from '@/stores/notes'
import { useOperatorStore } from '@/stores/operator'
import { useOrchestraStore } from '@/stores/orchestra'
import { useProjectsStore } from '@/stores/projects'
import { useSkillsStore } from '@/stores/skills'
import { useWorkspaceStore } from '@/stores/workspace'
import { sessionDiff } from '@/utils/activity'
import { isCompaction } from '@/utils/prompt'

export type ChatItem =
  // steered : ajouté à une réponse en cours, l'agent l'a lu sans ouvrir de nouveau tour. agentId : identifiant que
  // l'agent lui donne, pour revenir avant lui. `at` (envoi, comme celui de la fin de tour) : absent des sessions
  // enregistrées avant lui.
  // `from` : venu de l'agent d'une autre session (`MessageFrom`). `orchestra` : envoyé en mode Orchestre.
  | { kind: 'user'; id: string; text: string; attachments?: Attachment[]; steered?: boolean; agentId?: string; at?: number; from?: MessageFrom; orchestra?: boolean }
  // Chat ouvert par une commande de Nuée : son message d'ouverture est rendu depuis cet élément, sans tour
  // d'agent. `skill` : le skill à modifier tel qu'il était à l'ouverture.
  | { kind: 'command'; id: string; command: ChatCommand; skill?: { name: string; description: string; automatic: boolean } }
  | { kind: 'text'; id: string; text: string }
  // durationMs : null tant que l'agent réfléchit.
  | { kind: 'thinking'; id: string; text: string; durationMs: number | null }
  // Champs optionnels : absents des sessions enregistrées avant eux.
  | {
      kind: 'tool'
      id: string
      name: string
      tool: ToolKind
      summary: string | null
      output: string | null
      status: 'running' | 'done' | 'failed'
      detail?: ToolDetail | null
      change?: FileChange | null
      // Image rendue par l'outil, copiée avec les pièces jointes du chat (seul dossier que la webview affiche).
      image?: string
      task?: TaskState
      // Questions de l'agent et réponses données dans Nuée (null : passée), posées une fois la carte validée.
      answers?: { prompt: string; answer: string | null }[]
    }
  | { kind: 'end'; id: string; status: TurnStatus; error: string | null; durationMs: number | null; at?: number }
  | { kind: 'error'; id: string; error: AppError }
  // L'agent reprend de lui-même (tâche de fond finie) : repère posé avant sa réponse, qui sinon suit la précédente.
  // `task` : description de la dernière tâche de fond finie, quand elle est connue.
  | { kind: 'resume'; id: string; at: number; task?: string | null }
  // Conversation résumée pour libérer du contexte : demandée par `/compact` (à la place de sa bulle, elle clôt le
  // tour) ou lancée par l'agent en plein tour (`auto`). before/after : tokens occupés, absents si l'agent ne les a
  // pas donnés.
  | { kind: 'compact'; id: string; status: 'running' | 'done' | 'stopped' | 'failed'; auto?: boolean; before?: number; after?: number; error?: string; at: number }
  // Action git réussie depuis l'interface (`stores/gitActions.ts`), lue par git. `told` : l'agent l'a apprise.
  | { kind: 'git'; id: string; at: number; action: GitAction; subject: string | null; branch: string | null; repo: string | null; told?: boolean }
  // Note tirée de la session par « Résumer en note » : une carte qui y mène. `focus` : ce que l'utilisateur voulait garder.
  | { kind: 'note'; id: string; at: number; noteId: string; title: string; focus?: string }

export type CommandItem = Extract<ChatItem, { kind: 'command' }>
export type CompactItem = Extract<ChatItem, { kind: 'compact' }>
export type ToolItem = Extract<ChatItem, { kind: 'tool' }>
export type GitItem = Extract<ChatItem, { kind: 'git' }>

// Tâche lancée par un outil (sous-agent, commande en arrière-plan), suivie sur l'élément de cet outil.
export interface TaskState {
  id: string
  kind: TaskKind
  status: TaskStatus
  description: string | null
  progress: string | null
  background: boolean
  toolUses: number | null
  durationMs: number | null
  // Outils appelés par un sous-agent, dans l'ordre ; absents des sessions enregistrées avant eux.
  steps?: TaskStep[]
  // Identifiant donné par l'agent (`claude-haiku-5-5`).
  model?: string | null
  // Lancement (Date.now()), pour la durée qui défile ; absent des sessions enregistrées avant lui.
  startedAt?: number
}

export interface TaskStep {
  id: string
  name: string
  tool: ToolKind
  summary: string | null
  detail: ToolDetail | null
  status: 'running' | 'done' | 'failed'
}

// Où travaille l'agent. cwd null : chat sans projet, Rust lui donne un dossier vide à lui. worktree : un worktree
// du projet, worktreePath s'il en a rejoint un (sinon le sien, que Rust crée au premier message).
export interface Place {
  cwd: string | null
  worktree: boolean
  worktreePath: string | null
  // Branche d'où part son propre worktree, créé au premier message. null : la branche actuelle du projet.
  worktreeBase: string | null
}

// Titre gardé pour une session supprimée depuis ; sinon l'affichage prend le titre actuel. `task` : consigne de
// départ d'une session lancée par une autre, `report` : fin de tour d'une session lancée.
export interface MessageFrom {
  id: string
  title: string | null
  report?: boolean
  task?: boolean
}

export interface Queued {
  id: string
  place: Place
  prompt: string
  attachments: Attachment[]
  from?: MessageFrom
  orchestra?: boolean
}

export type Approval = Omit<Extract<AgentEvent, { type: 'approval' }>, 'type'>

// answering : l'agent répond. finishing : réponse complète, l'agent range encore son tour (résumé, hooks).
export type Phase = 'idle' | 'answering' | 'finishing'

export interface Conversation {
  agent: AgentKind
  sessionId: string | null
  options: TurnOptions
  phase: Phase
  // Début du tour en cours, pour la durée affichée à la fin de la réponse.
  startedAt: number
  // Dernier événement reçu : une réflexion commence là, son texte n'arrive qu'à la fin.
  activeAt: number
  thinkingAt: number
  // Temps passé à attendre une réponse à une demande d'autorisation : il ne compte pas dans la durée.
  pausedMs: number
  pausedAt: number | null
  // Messages envoyés pendant un tour, qui partent un par un aux tours suivants. Non enregistrés.
  queue: readonly Queued[]
  // Limite d'utilisation atteinte pendant le dernier tour : remise à zéro annoncée par l'agent (ms), si connue.
  limited: { resetsAt: number | null } | null
  // Reprise programmée après une limite : heure prévue (ms). Non enregistrée.
  resumeAt: number | null
  // Dossier du dernier tour : la reprise automatique repart au même endroit.
  lastPlace: Place | null
  // Fin du cache de prompt écrit par le dernier tour (ms). Non enregistrée.
  cacheUntil: number | null
  // Demandes d'autorisation (mode Auto) en attente de réponse, la plus ancienne d'abord. Non enregistrées.
  approvals: readonly Approval[]
  // Dernier relevé de la fenêtre de contexte, null tant que l'agent n'en a pas donné pour ce modèle.
  context: ContextUsage | null
  // Faux tant que l'historique n'est pas lu : envoyer avant écraserait la conversation chargée.
  loaded: boolean
  // Remplacé à chaque frame, jamais muté : un élément modifié est un nouvel objet.
  items: readonly ChatItem[]
}

const SAVE_DELAY = 600
// Comme T3 Code et le terminal de Claude Code : une longue session laissée de côté est résumée peu avant la fin de son
// cache. Après, le message suivant relirait toute la conversation au prix fort ; le résumé, lui, lit encore le cache.
const IDLE_COMPACT_MIN_TOKENS = 200_000
const IDLE_COMPACT_LEAD = 2 * 60_000
// Chaque écriture resérialise tout l'historique (plusieurs Mo avec des sorties d'outils) : espacées pendant une réponse,
// la fin du tour enregistre de toute façon tout de suite.
const STREAM_SAVE_DELAY = 15_000
const RESUME_MARGIN = 5000

// findLastIndex n'est pas dans la lib TS du projet (ES2022).
function lastIndex(items: readonly ChatItem[], match: (item: ChatItem) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item && match(item)) return i
  }
  return -1
}

// Le séparateur d'une action git et la carte d'un résumé en note se posent entre deux tours : la fin du dernier tour
// est avant eux.
export function lastTurnIndex(items: readonly ChatItem[]) {
  return lastIndex(items, (item) => item.kind !== 'git' && item.kind !== 'note')
}

export function lastTurnItem(items: readonly ChatItem[]) {
  return items[lastTurnIndex(items)]
}

function lastIndexOfTool(items: ChatItem[], id: string) {
  return lastIndex(items, (item) => item.kind === 'tool' && item.id === id)
}

function elapsed(conversation: Conversation) {
  const now = performance.now()
  const paused = conversation.pausedMs + (conversation.pausedAt === null ? 0 : now - conversation.pausedAt)
  return Math.round(now - conversation.startedAt - paused)
}

// Le compteur s'arrête à la première demande en attente et repart quand il n'en reste plus.
function setApprovals(conversation: Conversation, approvals: readonly Approval[]) {
  const now = performance.now()
  if (!conversation.approvals.length && approvals.length) conversation.pausedAt = now
  if (conversation.approvals.length && !approvals.length && conversation.pausedAt !== null) {
    conversation.pausedMs += now - conversation.pausedAt
    conversation.pausedAt = null
  }
  conversation.approvals = approvals
}

function settleTools(items: ChatItem[], status: 'done' | 'failed') {
  items.forEach((item, i) => {
    if (item.kind === 'tool' && item.status === 'running') items[i] = { ...item, status }
  })
}

// Une tâche encore en cours quand son process disparaît ne finira jamais.
function settleTasks(items: ChatItem[]) {
  items.forEach((item, i) => {
    if (item.kind === 'tool' && item.task?.status === 'running') items[i] = { ...item, task: { ...item.task, status: 'stopped' } }
  })
}

// La réflexion s'arrête dès que l'agent fait autre chose.
function endThinking(conversation: Conversation, items: ChatItem[]) {
  const last = items.at(-1)
  if (last?.kind === 'thinking' && last.durationMs === null) {
    items[items.length - 1] = { ...last, durationMs: Math.round(performance.now() - conversation.thinkingAt) }
  }
}

function emptyTask(id: string): TaskState {
  return { id, kind: 'other', status: 'running', description: null, progress: null, background: false, toolUses: null, durationMs: null, startedAt: Date.now() }
}

function lastIndexOfTask(items: ChatItem[], id: string, toolId: string | null) {
  return lastIndex(items, (item) => item.kind === 'tool' && (item.task?.id === id || (!!toolId && item.id === toolId)))
}

function lastIndexOfCompacting(items: readonly ChatItem[]) {
  return lastIndex(items, (item) => item.kind === 'compact' && item.status === 'running')
}

// Fin de tour : un résumé encore en cours finit avec lui. Arrêté par l'utilisateur, l'agent l'a d'abord dit raté.
function settleCompaction(items: ChatItem[], status: TurnStatus) {
  const index = lastIndex(items, (item) => item.kind === 'compact')
  const compact = items[index]
  if (compact?.kind !== 'compact') return
  const last = index === items.length - 1
  if (status === 'stopped' && (compact.status === 'running' || (compact.status === 'failed' && last))) {
    items[index] = { ...compact, status: 'stopped', error: undefined }
  } else if (compact.status === 'running') items[index] = { ...compact, status: 'failed' }
}

// L'agent repart après sa réponse (un hook lui a demandé de continuer) : la fin affichée était prématurée.
function resume(conversation: Conversation, items: ChatItem[]) {
  if (conversation.phase !== 'finishing') return
  if (items.at(-1)?.kind === 'end') items.pop()
  conversation.phase = 'answering'
}

// Ce qui mérite de prévenir l'utilisateur, du plus au moins important quand une frame en apporte plusieurs.
const SIGNALS: readonly Signal[] = ['approval', 'question', 'failed', 'done']

function strongest(current: Signal | null, next: Signal) {
  return current && SIGNALS.indexOf(current) < SIGNALS.indexOf(next) ? current : next
}

// `ended` : le tour s'est clos. `signal` : de quoi prévenir l'utilisateur (un arrêt demandé n'en est pas).
function apply(conversation: Conversation, events: AgentEvent[]) {
  const items = [...conversation.items]
  let ended = false
  let signal: Signal | null = null
  for (const event of events) {
    if (event.type === 'text' || event.type === 'tool' || event.type === 'thinking') resume(conversation, items)
    if (event.type !== 'thinking' && event.type !== 'usage' && event.type !== 'task' && event.type !== 'context') endThinking(conversation, items)
    switch (event.type) {
      case 'session':
        conversation.sessionId = event.id
        break
      case 'text': {
        const last = items.at(-1)
        if (last?.kind === 'text' && last.id === event.id) items[items.length - 1] = { ...last, text: last.text + event.delta }
        else items.push({ kind: 'text', id: event.id, text: event.delta })
        break
      }
      case 'thinking': {
        const last = items.at(-1)
        if (last?.kind === 'thinking' && last.id === event.id) items[items.length - 1] = { ...last, text: last.text + event.delta }
        else {
          endThinking(conversation, items)
          conversation.thinkingAt = conversation.activeAt
          items.push({ kind: 'thinking', id: event.id, text: event.delta, durationMs: null })
        }
        break
      }
      case 'tool': {
        const index = lastIndexOfTool(items, event.id)
        const tool = items[index]
        if (tool?.kind === 'tool') {
          const { name, kind, summary, detail } = event
          items[index] = { ...tool, name, tool: kind, summary: summary ?? tool.summary, detail: detail ?? tool.detail ?? null }
        } else {
          const { id, name, kind, summary, detail } = event
          items.push({ kind: 'tool', id, name, tool: kind, summary, detail, output: null, status: 'running' })
        }
        break
      }
      case 'toolResult': {
        const index = lastIndexOfTool(items, event.id)
        const tool = items[index]
        if (tool?.kind === 'tool') {
          items[index] = { ...tool, output: event.output, change: event.change, status: event.isError ? 'failed' : 'done' }
        }
        break
      }
      case 'task': {
        const index = lastIndexOfTask(items, event.id, event.toolId)
        const tool = items[index]
        if (tool?.kind !== 'tool') break
        const task: TaskState = tool.task ?? emptyTask(event.id)
        items[index] = {
          ...tool,
          task: {
            ...task,
            id: event.id,
            kind: event.kind ?? task.kind,
            status: event.status ?? task.status,
            description: event.description ?? task.description,
            progress: event.progress ?? task.progress,
            background: event.background ?? task.background,
            toolUses: event.toolUses ?? task.toolUses,
            durationMs: event.durationMs ?? task.durationMs,
          },
        }
        break
      }
      case 'taskStep': {
        const index = lastIndex(items, (item) => item.kind === 'tool' && item.id === event.toolId)
        const tool = items[index]
        if (tool?.kind !== 'tool') break
        const task: TaskState = tool.task ?? emptyTask(event.toolId)
        const steps = [...(task.steps ?? [])]
        const at = steps.findIndex((step) => step.id === event.id)
        const status = event.status === 'running' ? 'running' : event.status === 'failed' ? 'failed' : 'done'
        if (at === -1 && event.name) {
          steps.push({ id: event.id, name: event.name, tool: event.kind ?? 'other', summary: event.summary, detail: event.detail, status })
        } else if (at !== -1) {
          steps[at] = { ...steps[at]!, status }
        }
        items[index] = { ...tool, task: { ...task, steps, model: event.model ?? task.model ?? null } }
        break
      }
      case 'approval': {
        const { type: _, ...approval } = event
        setApprovals(conversation, [...conversation.approvals, approval])
        signal = strongest(signal, approval.questions ? 'question' : 'approval')
        break
      }
      case 'approvalCancelled':
        setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== event.id))
        break
      case 'context': {
        conversation.context = { used: event.used, window: event.window, categories: event.categories }
        // Premier relevé après le résumé, demandé dès sa fin : il donne la taille d'après. Une fois une fin de tour
        // passée, le relevé porte sur la suite de la conversation.
        const index = lastIndex(items, (item) => item.kind === 'compact')
        const compact = items[index]
        if (compact?.kind === 'compact' && compact.status === 'done' && compact.after === undefined && !items.slice(index + 1).some((item) => item.kind === 'end')) {
          items[index] = { ...compact, after: event.used }
        }
        break
      }
      case 'compacting':
        if (lastIndexOfCompacting(items) < 0) items.push({ kind: 'compact', id: crypto.randomUUID(), status: 'running', auto: true, at: Date.now() })
        break
      case 'compacted': {
        const index = lastIndexOfCompacting(items)
        const compact = items[index]
        const before = event.before ?? undefined
        if (compact?.kind === 'compact') items[index] = { ...compact, status: 'done', before }
        else items.push({ kind: 'compact', id: crypto.randomUUID(), status: 'done', auto: true, before, at: Date.now() })
        break
      }
      // Un résumé automatique raté ne change rien au tour, que l'agent poursuit : il ne laisse pas de trace.
      case 'compactFailed': {
        const index = lastIndexOfCompacting(items)
        const compact = items[index]
        if (compact?.kind !== 'compact') break
        if (compact.auto) items.splice(index, 1)
        else items[index] = { ...compact, status: 'failed', ...(event.error && { error: event.error }) }
        break
      }
      case 'limited':
        conversation.limited = { resetsAt: event.resetsAt }
        break
      // Le premier message encore sans identifiant qui correspond : l'agent les renvoie dans l'ordre d'envoi.
      case 'userMessage': {
        const after = lastIndex(items, (item) => item.kind === 'user' && !!item.agentId)
        const index = items.findIndex((item, i) => i > after && item.kind === 'user' && event.text.includes(item.text))
        const user = items[index]
        if (user?.kind === 'user') items[index] = { ...user, agentId: event.id }
        break
      }
      // L'agent reprend de lui-même pour rendre compte d'une tâche de fond finie.
      case 'turnStart':
        if (conversation.phase !== 'idle') break
        conversation.phase = 'answering'
        conversation.startedAt = performance.now()
        conversation.activeAt = conversation.startedAt
        conversation.pausedMs = 0
        conversation.pausedAt = null
        const done = items[lastIndex(items, (item) => item.kind === 'tool' && !!item.task?.background && item.task.status !== 'running')]
        const task = done?.kind === 'tool' ? (done.task?.description ?? null) : null
        items.push({ kind: 'resume', id: crypto.randomUUID(), at: Date.now(), task })
        break
      case 'cache':
        conversation.cacheUntil = Date.now() + event.ttl * 1000
        break
      case 'answered': {
        if (conversation.phase !== 'answering') break
        settleTools(items, 'done')
        items.push({ kind: 'end', id: crypto.randomUUID(), status: 'completed', error: null, durationMs: elapsed(conversation), at: Date.now() })
        conversation.phase = 'finishing'
        signal = strongest(signal, 'done')
        break
      }
      case 'turnEnd': {
        settleTools(items, event.status === 'completed' ? 'done' : 'failed')
        const { status, error } = event
        settleCompaction(items, status)
        // Un tour qui n'a fait que résumer se clôt sur la ligne de compaction : pas de fin « Terminé » vide dessous.
        const compacted = items.at(-1)?.kind === 'compact' && (status === 'completed' || status === 'stopped')
        const shown = conversation.phase === 'finishing' && items.at(-1)?.kind === 'end'
        if (shown && status !== 'completed') items[items.length - 1] = { kind: 'end', id: crypto.randomUUID(), status, error, durationMs: null, at: Date.now() }
        if (!shown && !compacted) {
          const durationMs = status === 'completed' ? elapsed(conversation) : null
          items.push({ kind: 'end', id: crypto.randomUUID(), status, error, durationMs, at: Date.now() })
        }
        if (status === 'failed' || status === 'unauthenticated') signal = strongest(signal, 'failed')
        else if (status === 'completed' && !shown) signal = strongest(signal, 'done')
        conversation.phase = 'idle'
        setApprovals(conversation, [])
        ended = true
        break
      }
    }
  }
  conversation.items = items
  conversation.activeAt = performance.now()
  return { ended, signal }
}

// Texte que l'agent écrivait quand l'utilisateur l'a arrêté : un process relancé ne l'a plus en mémoire.
function interruptedText(items: readonly ChatItem[]) {
  const lastUser = lastIndex(items, (item) => item.kind === 'user')
  const turn = items.slice(lastUser + 1)
  if (!turn.some((item) => item.kind === 'end' && item.status === 'stopped')) return null
  const afterTools = turn.slice(lastIndex(turn, (item) => item.kind === 'tool') + 1)
  const text = afterTools.flatMap((item) => (item.kind === 'text' ? [item.text] : [])).join('\n\n')
  return text.trim() ? text : null
}

// Un tour coupé par la fermeture de l'app n'a jamais reçu sa fin : on la pose au chargement.
function settleInterrupted(saved: ChatItem[]) {
  const items = saved.map((item) => (item.kind === 'compact' && item.status === 'running' ? { ...item, status: 'stopped' as const } : item))
  settleTasks(items)
  const last = lastTurnItem(items)
  if (!last || last.kind === 'end' || last.kind === 'error' || last.kind === 'command' || last.kind === 'compact') return items
  settleTools(items, 'failed')
  items.push({ kind: 'end', id: crypto.randomUUID(), status: 'stopped', error: null, durationMs: null })
  return items
}

// Conversations par chat. Les événements d'agent sont appliqués une fois par frame, l'historique
// est enregistré peu après chaque changement.
export const useConversationsStore = defineStore('conversations', () => {
  const catalog = useCatalogStore()
  const agentSettings = useAgentsStore()
  const projects = useProjectsStore()
  const skills = useSkillsStore()
  const conversations = shallowReactive(new Map<string, Conversation>())
  // Un agent travaille encore quelque part : la mise en veille attend.
  const busy = computed(() => [...conversations.values()].some((conversation) => conversation.phase !== 'idle'))
  const pending = new Map<string, AgentEvent[]>()
  const timers = new Map<string, number>()
  const streamSaves = new Set<string>()
  const resumeTimers = new Map<string, number>()
  const compactTimers = new Map<string, number>()
  const writes = new Map<string, Promise<void>>()
  let frame = 0

  function blank(agent: AgentKind, loaded: boolean, projectId: string | null) {
    return shallowReactive<Conversation>({
      agent,
      sessionId: null,
      // Un nouveau chat part des réglages de son projet ou de Réglages > Agents ; un chat enregistré reprend les siens.
      options: projects.chatOptions(projectId, agent),
      phase: 'idle',
      startedAt: 0,
      activeAt: 0,
      thinkingAt: 0,
      pausedMs: 0,
      pausedAt: null,
      queue: [],
      limited: null,
      resumeAt: null,
      lastPlace: null,
      cacheUntil: null,
      approvals: [],
      context: null,
      loaded,
      items: [],
    })
  }

  // Les écritures d'un chat passent l'une après l'autre : une sauvegarde ancienne n'écrase jamais une récente.
  function write(chatId: string, task: () => Promise<void>) {
    const next = (writes.get(chatId) ?? Promise.resolve()).then(task).catch((error) => console.error('historique', error))
    writes.set(chatId, next)
  }

  // Une écriture au plus par SAVE_DELAY : pendant une réponse en flux, chaque image redemandait la sauvegarde et
  // repoussait le délai, rien n'était écrit avant la fin. La conversation est lue au moment d'écrire.
  function save(chatId: string) {
    const answering = conversations.get(chatId)?.phase === 'answering'
    const scheduled = timers.get(chatId)
    if (scheduled !== undefined) {
      // Réponse finie : la sauvegarde espacée du flux part sans attendre.
      if (answering || !streamSaves.has(chatId)) return
      clearTimeout(scheduled)
    }
    if (answering) streamSaves.add(chatId)
    else streamSaves.delete(chatId)
    const timer = window.setTimeout(() => {
      timers.delete(chatId)
      streamSaves.delete(chatId)
      const conversation = conversations.get(chatId)
      if (!conversation?.loaded) return
      const { sessionId, options, items, context } = conversation
      const diff = sessionDiff(items)
      useWorkspaceStore().setSummary(chatId, { model: options.model, ...diff })
      write(chatId, () => chatSave(chatId, { sessionId, options, items: [...items], context, ...diff }))
    }, answering ? STREAM_SAVE_DELAY : SAVE_DELAY)
    timers.set(chatId, timer)
  }

  function find(chatId: string) {
    return conversations.get(chatId)
  }

  // Messages d'un chat, lus en base s'il n'est pas en mémoire (session fermée).
  async function itemsOf(chatId: string): Promise<readonly ChatItem[]> {
    const conversation = conversations.get(chatId)
    if (conversation?.loaded) return conversation.items
    return ((await chatContent(chatId))?.items as ChatItem[] | undefined) ?? []
  }

  // L'agent répond dans ce chat (barre latérale, onglets).
  function working(chatId: string) {
    return conversations.get(chatId)?.phase === 'answering'
  }

  function create(chat: ChatSummary) {
    conversations.set(chat.id, blank(chat.agent, true, chat.projectId))
    write(chat.id, () => chatCreate(chat))
  }

  // Lit l'historique au premier affichage du chat.
  function open(chatId: string, agent: AgentKind, projectId: string | null) {
    if (conversations.has(chatId)) return
    const conversation = blank(agent, false, projectId)
    conversations.set(chatId, conversation)
    chatContent(chatId)
      .then((content) => {
        if (!content) return
        conversation.sessionId = content.sessionId
        conversation.options = content.options
        conversation.context = content.context
        conversation.items = settleInterrupted(content.items as ChatItem[])
        useOrchestraStore().remember(chatId, conversation.items)
      })
      .catch((error) => console.error('historique', error))
      .finally(() => {
        conversation.loaded = true
      })
  }

  function setOptions(chatId: string, options: TurnOptions) {
    const conversation = conversations.get(chatId)
    if (!conversation) return
    // La fenêtre dépend du modèle : l'ancien relevé donnerait un faux pourcentage jusqu'au prochain tour.
    const { agent } = conversation
    if (catalog.resolve(agent, options).model !== catalog.resolve(agent, conversation.options).model) conversation.context = null
    conversation.options = options
    save(chatId)
  }

  function flush() {
    frame = 0
    for (const [chatId, events] of pending) {
      const conversation = conversations.get(chatId)
      if (!conversation) continue
      const { ended, signal } = apply(conversation, events)
      save(chatId)
      for (const event of events) {
        if (event.type === 'turnEnd') agentSettings.confirm(conversation.agent, event.status)
        else if (event.type === 'usage') agentSettings.track(conversation.agent, event)
      }
      for (const event of events) if (event.type === 'toolResult' && event.image) keepImage(chatId, event.id, event.image)
      if (signal) useAttentionStore().signal(chatId, signal)
      // Un chat de skill peut écrire le fichier à n'importe quel tour : chaque fin de tour fait relire la config.
      if (ended && conversation.items.some((item) => item.kind === 'command')) skills.loadSkills()
      if (ended) {
        useWorkspaceStore().touch(chatId)
        afterTurn(chatId, conversation)
        scheduleCompaction(chatId)
        useOperatorStore().turnEnded(chatId, conversation.items)
      }
    }
    pending.clear()
  }

  // L'image arrive en base64 dans le flux ; écrite sur disque, l'historique n'en garde que le chemin.
  function keepImage(chatId: string, toolId: string, image: ToolImage) {
    const extension = image.mediaType.split('/')[1] ?? 'png'
    attachmentSaveBase64(chatId, `image.${extension}`, image.base64)
      .then(({ preview }) => {
        const conversation = conversations.get(chatId)
        if (!conversation || !preview) return
        const items = [...conversation.items]
        const index = lastIndexOfTool(items, toolId)
        const tool = items[index]
        if (tool?.kind !== 'tool') return
        items[index] = { ...tool, image: preview }
        conversation.items = items
        save(chatId)
      })
      .catch((error) => console.error('image', error))
  }

  function queue(chatId: string, event: AgentEvent) {
    const events = pending.get(chatId)
    if (events) events.push(event)
    else pending.set(chatId, [event])
    frame ||= requestAnimationFrame(flush)
  }

  function push(conversation: Conversation, item: ChatItem) {
    conversation.items = [...conversation.items, item]
  }

  function spec(chatId: string, conversation: Conversation, place: Place): SessionSpec {
    const { agent, sessionId } = conversation
    const { hooks } = agentSettings.settings[agent]
    return { chatId, agent, ...place, sessionId, options: catalog.resolve(agent, conversation.options), hooks, ...skills.exclusions() }
  }

  async function dispatch(chatId: string, conversation: Conversation, place: Place, prompt: string, attachments: Attachment[], briefing: ChatCommand | null = null) {
    conversation.lastPlace = place
    // `/compact` part seul : un texte ajouté devant, rappel ou consignes, le ferait lire comme un message.
    const compaction = conversation.items.at(-1)?.kind === 'compact'
    // Calculé avant que le nouveau message ne s'ajoute : il porte sur le tour précédent.
    const recap = compaction ? null : interruptedText(conversation.items.slice(0, lastIndex(conversation.items, (item) => item.kind === 'user')))
    // Les consignes partent tant qu'aucun tour n'a abouti : la session les garde ensuite, `--resume` compris.
    const opening = conversation.sessionId || compaction ? undefined : conversation.items.find((item) => item.kind === 'command')
    const command = opening?.kind === 'command' ? opening.command : briefing
    conversation.phase = 'answering'
    conversation.startedAt = performance.now()
    conversation.activeAt = conversation.startedAt
    conversation.pausedMs = 0
    conversation.pausedAt = null
    try {
      const worktree = await agentSend(spec(chatId, conversation, place), prompt, attachments, recap, command, (event) => queue(chatId, event))
      if (worktree && worktree !== place.worktreePath) useWorkspaceStore().adoptWorktree(chatId, worktree)
    } catch (error) {
      conversation.phase = 'idle'
      const appError: AppError = isAppError(error) ? error : { kind: 'io', message: String(error) }
      push(conversation, { kind: 'error', id: crypto.randomUUID(), error: appError })
      save(chatId)
    }
  }

  function start(chatId: string, conversation: Conversation, message: Omit<Queued, 'id'>) {
    const { place, prompt, attachments } = message
    useWorkspaceStore().touch(chatId)
    // Consignes du mode Orchestre : au premier message envoyé dans ce mode, la session les garde ensuite.
    const previous = conversation.items[lastIndex(conversation.items, (item) => item.kind === 'user' && !item.from)]
    const briefing: ChatCommand | null = message.orchestra && !(previous?.kind === 'user' && previous.orchestra) ? { kind: 'orchestra' } : null
    // Avant le premier message, il n'y a rien à résumer : `/compact` reste une bulle, à laquelle l'agent répond.
    if (isCompaction(prompt, attachments) && conversation.items.some((item) => item.kind === 'user')) {
      push(conversation, { kind: 'compact', id: crypto.randomUUID(), status: 'running', at: Date.now() })
    } else {
      push(conversation, { kind: 'user', id: crypto.randomUUID(), text: prompt, attachments, at: Date.now(), ...(message.from ? { from: message.from } : {}), ...(message.orchestra ? { orchestra: true } : {}) })
    }
    const note = gitNote(conversation, message)
    if (note) tell(conversation, note.ids)
    save(chatId)
    dispatch(chatId, conversation, place, note ? `${note.text}\n\n${agentPrompt(message)}` : agentPrompt(message), attachments, briefing)
  }

  // Message d'une autre session : l'agent lit de qui il vient, la conversation garde le texte seul.
  function agentPrompt({ prompt, from }: Pick<Queued, 'prompt' | 'from'>) {
    if (!from) return useNotesStore().expand(prompt)
    if (from.task) return prompt
    const params = { title: from.title ?? from.id, id: from.id, text: prompt, answer: prompt }
    return i18nGlobal().t(from.report ? 'operator.reported' : 'operator.received', params)
  }

  // Actions git faites depuis l'interface que l'agent ignore encore : une note devant le message suivant de
  // l'utilisateur, jamais dans sa bulle. Pas devant une commande « / », que la CLI ne reconnaîtrait plus.
  function gitNote(conversation: Conversation, { prompt, from }: Pick<Queued, 'prompt' | 'from'>) {
    if (from || prompt.trimStart().startsWith('/')) return null
    const pending = conversation.items.filter((item): item is GitItem => item.kind === 'git' && !item.told)
    if (!pending.length) return null
    const { t } = i18nGlobal()
    const detail = (item: GitItem) => {
      if (item.action === 'initRepo') return item.repo ? t('operator.git.repo', { repo: item.repo }) : ''
      if (item.action === 'push') return item.branch ? t('operator.git.branch', { branch: item.branch }) : ''
      return item.subject ? t('operator.git.commit', { subject: item.subject }) : ''
    }
    const text = pending.map((item) => t('operator.git.note', { done: t(`operator.git.done.${item.action}`), detail: detail(item) })).join('\n')
    return { text, ids: new Set(pending.map((item) => item.id)) }
  }

  // Enregistré avec la conversation : la note ne repart pas, même après un redémarrage.
  function tell(conversation: Conversation, ids: Set<string>) {
    conversation.items = conversation.items.map((item) => (item.kind === 'git' && ids.has(item.id) ? { ...item, told: true } : item))
  }

  // Élément posé par Nuée hors d'un tour (action git réussie), sans message ni tour d'agent.
  function note(chatId: string, item: ChatItem) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded) return
    push(conversation, item)
    save(chatId)
  }

  // Le message rejoint la réponse en cours ; trop tard (réponse complète), il reste dans la file.
  async function steer(chatId: string, conversation: Conversation, message: Queued) {
    const note = gitNote(conversation, message)
    const steered = await agentSteer(chatId, note ? `${note.text}\n\n${agentPrompt(message)}` : agentPrompt(message), message.attachments).catch(() => false)
    if (!steered) {
      if (conversation.phase === 'idle') afterTurn(chatId, conversation)
      return
    }
    if (note) tell(conversation, note.ids)
    conversation.queue = conversation.queue.filter((item) => item.id !== message.id)
    push(conversation, { kind: 'user', id: message.id, text: message.prompt, attachments: message.attachments, steered: true, at: Date.now(), ...(message.from ? { from: message.from } : {}) })
    save(chatId)
  }

  // Fin de tour : la reprise après une limite se programme, sinon le message suivant de la file part.
  // Après un arrêt demandé, la file attend un geste de l'utilisateur.
  function afterTurn(chatId: string, conversation: Conversation) {
    const last = lastTurnItem(conversation.items)
    if (conversation.limited && last?.kind === 'end' && last.status === 'failed') {
      if (useGeneralStore().autoResume) scheduleResume(chatId)
      return
    }
    conversation.limited = null
    if ((last?.kind === 'end' || last?.kind === 'compact') && last.status === 'stopped') return
    const [next, ...rest] = conversation.queue
    if (!next) return
    conversation.queue = rest
    start(chatId, conversation, next)
  }

  // Pendant un tour, le message attend la fin, ou rejoint la réponse en cours selon Réglages › Général.
  // `other` : ⌘↵, l'inverse du réglage pour un message envoyé pendant une réponse.
  // `from` : message de l'agent d'une autre session.
  function send(chatId: string, place: Place, prompt: string, attachments: Attachment[], other = false, from?: MessageFrom) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded) return
    const orchestra = !from && useOrchestraStore().isOn(chatId)
    const message: Queued = { id: crypto.randomUUID(), place, prompt, attachments, ...(from ? { from } : {}), ...(orchestra ? { orchestra } : {}) }
    // L'agent attend : le message part, une reprise programmée devient inutile.
    if (conversation.phase === 'idle') {
      cancelResume(chatId)
      conversation.limited = null
      return start(chatId, conversation, message)
    }
    conversation.queue = [...conversation.queue, message]
    // `/compact` résume la conversation entière : il attend la fin du tour au lieu de rejoindre la réponse.
    const steering = (useGeneralStore().followUp === 'steer') !== other
    // Les consignes d'Orchestre ne passent qu'à l'ouverture d'un tour : ce message attend la fin de celui-ci.
    if (conversation.phase === 'answering' && steering && !orchestra && !isCompaction(prompt, attachments)) steer(chatId, conversation, message)
  }

  // Message de la file envoyé tout de suite : ajouté à la réponse en cours, ou envoyé si l'agent attend.
  function sendNow(chatId: string, id: string) {
    const conversation = conversations.get(chatId)
    const message = conversation?.queue.find((item) => item.id === id)
    if (!conversation || !message) return
    if (conversation.phase === 'answering') return steer(chatId, conversation, message)
    if (conversation.phase !== 'idle') return
    cancelResume(chatId)
    conversation.limited = null
    conversation.queue = conversation.queue.filter((item) => item.id !== id)
    start(chatId, conversation, message)
  }

  function unqueue(chatId: string, id: string) {
    const conversation = conversations.get(chatId)
    if (conversation) conversation.queue = conversation.queue.filter((item) => item.id !== id)
  }

  // Quelques secondes après la remise à zéro annoncée : l'agent reprend où il s'était arrêté.
  function scheduleResume(chatId: string) {
    const conversation = conversations.get(chatId)
    const at = conversation?.limited?.resetsAt
    if (!conversation || !at) return
    clearTimeout(resumeTimers.get(chatId))
    conversation.resumeAt = at
    resumeTimers.set(chatId, window.setTimeout(() => resume(chatId), Math.max(0, at - Date.now()) + RESUME_MARGIN))
  }

  function cancelResume(chatId: string) {
    clearTimeout(resumeTimers.get(chatId))
    resumeTimers.delete(chatId)
    const conversation = conversations.get(chatId)
    if (conversation) conversation.resumeAt = null
  }

  function scheduleCompaction(chatId: string) {
    cancelCompaction(chatId)
    const until = conversations.get(chatId)?.cacheUntil
    // Comme Claude Code, seulement avec le cache d'une heure : avec celui de 5 min (clé d'API), le résumé tomberait
    // pendant qu'on lit encore la réponse.
    if (!until || until - Date.now() < 10 * 60_000) return
    compactTimers.set(chatId, window.setTimeout(() => compactIdle(chatId), Math.max(0, until - IDLE_COMPACT_LEAD - Date.now())))
  }

  function cancelCompaction(chatId: string) {
    clearTimeout(compactTimers.get(chatId))
    compactTimers.delete(chatId)
  }

  function compactIdle(chatId: string) {
    compactTimers.delete(chatId)
    const conversation = conversations.get(chatId)
    const place = conversation?.lastPlace
    if (!conversation || !place || !useGeneralStore().idleCompaction) return
    if (conversation.phase !== 'idle' || conversation.queue.length || conversation.approvals.length || conversation.limited || conversation.resumeAt) return
    if ((conversation.context?.used ?? 0) < IDLE_COMPACT_MIN_TOKENS || !conversation.cacheUntil || Date.now() >= conversation.cacheUntil) return
    // Après un résumé ou un tour arrêté, rien à refaire. Une tâche de fond finira dans le tour suivant, pas dans le résumé.
    const last = lastTurnItem(conversation.items)
    if (last?.kind !== 'end' || last.status !== 'completed') return
    if (conversation.items.some((item) => item.kind === 'tool' && item.task?.status === 'running')) return
    start(chatId, conversation, { place, prompt: '/compact', attachments: [] })
  }

  function resume(chatId: string) {
    const conversation = conversations.get(chatId)
    cancelResume(chatId)
    const place = conversation?.lastPlace
    if (!conversation || !place || conversation.phase !== 'idle') return
    conversation.limited = null
    start(chatId, conversation, { place, prompt: i18nGlobal().t('chat.limit.resumePrompt'), attachments: [] })
  }

  // Chat ouvert par une commande de Nuée (création de skill...) : le message d'ouverture s'affiche aussitôt,
  // la commande part avec la première réponse de l'utilisateur.
  function begin(chatId: string, command: ChatCommand, skill?: CommandItem['skill']) {
    const conversation = conversations.get(chatId)
    if (!conversation) return
    push(conversation, { kind: 'command', id: crypto.randomUUID(), command, ...(skill && { skill }) })
    save(chatId)
  }

  // Appelé quand l'utilisateur commence à écrire ; Rust ignore l'appel si le process tourne déjà.
  function warm(chatId: string, place: Place) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded || conversation.phase !== 'idle') return
    agentWarm(spec(chatId, conversation, place))
      .then((context) => {
        if (context && conversation.phase === 'idle') conversation.context = context
      })
      .catch(() => {})
  }

  function approve(chatId: string, requestId: string, allow: boolean) {
    const conversation = conversations.get(chatId)
    if (!conversation) return
    setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== requestId))
    agentApprove(chatId, requestId, allow).catch(() => {})
  }

  // `answers` : une réponse par question, null pour une question passée ; null : toutes passées.
  function answer(chatId: string, requestId: string, answers: (string | null)[] | null) {
    const conversation = conversations.get(chatId)
    const questions = conversation?.approvals.find((approval) => approval.id === requestId)?.questions
    if (!conversation || !questions) return
    setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== requestId))
    const items = [...conversation.items]
    const index = lastIndex(items, (item) => item.kind === 'tool' && item.tool === 'question' && !item.answers)
    const tool = items[index]
    if (tool?.kind === 'tool') {
      items[index] = { ...tool, answers: questions.map((question, i) => ({ prompt: question.prompt, answer: answers?.[i] ?? null })) }
      conversation.items = items
    }
    agentAnswer(chatId, requestId, answers && answers.map((text) => text ?? '')).catch(() => {})
  }

  // Revient avant un message : l'agent oublie la suite et remet les fichiers dans leur état d'alors. Rend le texte du
  // message, à reprendre dans le champ de saisie, et ce que l'agent a pu faire des fichiers.
  async function rewind(chatId: string, place: Place, itemId: string) {
    const conversation = conversations.get(chatId)
    const index = conversation?.items.findIndex((item) => item.id === itemId) ?? -1
    const item = conversation?.items[index]
    if (!conversation || conversation.phase !== 'idle' || item?.kind !== 'user' || !item.agentId) return null
    const result = await agentRewind(spec(chatId, conversation, place), item.agentId)
    conversation.items = conversation.items.slice(0, index)
    save(chatId)
    return { ...result, prefill: result.prefill ?? item.text, attachments: item.attachments ?? [] }
  }

  function stopTask(chatId: string, taskId: string) {
    agentStopTask(chatId, taskId).catch(() => {})
  }

  // Le process reste ouvert : turnEnd arrive aussitôt avec le statut « stopped ».
  function stop(chatId: string) {
    if (conversations.get(chatId)?.phase === 'answering') agentStop(chatId).catch(() => {})
  }

  async function remove(chatId: string): Promise<string | null> {
    stop(chatId)
    cancelResume(chatId)
    clearTimeout(timers.get(chatId))
    timers.delete(chatId)
    streamSaves.delete(chatId)
    cancelCompaction(chatId)
    conversations.delete(chatId)
    pending.delete(chatId)
    let kept: string | null = null
    write(chatId, async () => {
      kept = await chatDelete(chatId)
    })
    await writes.get(chatId)
    return kept
  }

  // Session fermée et au repos : ses messages quittent la mémoire, `open` les relira en base. Rien n'est libéré tant
  // qu'il reste à écrire, à envoyer ou à afficher (file, autorisation, limite, reprise).
  function release(chatId: string) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded || conversation.phase !== 'idle') return
    if (conversation.queue.length || conversation.approvals.length || conversation.limited || conversation.resumeAt) return
    if (conversation.items.some((item) => item.kind === 'tool' && item.task?.status === 'running')) return
    if (timers.has(chatId) || pending.has(chatId) || resumeTimers.has(chatId)) return
    cancelCompaction(chatId)
    conversations.delete(chatId)
  }

  return { busy, find, working, itemsOf, create, open, release, setOptions, send, sendNow, unqueue, scheduleResume, cancelResume, begin, note, warm, approve, answer, stop, stopTask, rewind, remove }
})
