import { defineStore } from 'pinia'
import { computed, shallowReactive } from 'vue'
import { agentApprove, agentRewind, agentSend, agentSteer, agentStop, agentStopTask, agentWarm, isAppError } from '@/ipc/agent'
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
import { useProjectsStore } from '@/stores/projects'
import { useSkillsStore } from '@/stores/skills'
import { useWorkspaceStore } from '@/stores/workspace'

export type ChatItem =
  // steered : ajouté à une réponse en cours, l'agent l'a lu sans ouvrir de nouveau tour. agentId : identifiant que
  // l'agent lui donne, pour revenir avant lui. `at` (envoi, comme celui de la fin de tour) : absent des sessions
  // enregistrées avant lui.
  | { kind: 'user'; id: string; text: string; attachments?: Attachment[]; steered?: boolean; agentId?: string; at?: number }
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
    }
  | { kind: 'end'; id: string; status: TurnStatus; error: string | null; durationMs: number | null; at?: number }
  | { kind: 'error'; id: string; error: AppError }

export type CommandItem = Extract<ChatItem, { kind: 'command' }>
export type ToolItem = Extract<ChatItem, { kind: 'tool' }>

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
}

// Où travaille l'agent. cwd null : chat sans projet, Rust lui donne un dossier vide à lui. worktree : un worktree
// du projet, worktreePath s'il en a rejoint un (sinon le sien, que Rust crée au premier message).
export interface Place {
  cwd: string | null
  worktree: boolean
  worktreePath: string | null
}

export interface Queued {
  id: string
  place: Place
  prompt: string
  attachments: Attachment[]
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
const RESUME_MARGIN = 5000

// findLastIndex n'est pas dans la lib TS du projet (ES2022).
function lastIndex(items: readonly ChatItem[], match: (item: ChatItem) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item && match(item)) return i
  }
  return -1
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

function lastIndexOfTask(items: ChatItem[], id: string, toolId: string | null) {
  return lastIndex(items, (item) => item.kind === 'tool' && (item.task?.id === id || (!!toolId && item.id === toolId)))
}

// L'agent repart après sa réponse (un hook lui a demandé de continuer) : la fin affichée était prématurée.
function resume(conversation: Conversation, items: ChatItem[]) {
  if (conversation.phase !== 'finishing') return
  if (items.at(-1)?.kind === 'end') items.pop()
  conversation.phase = 'answering'
}

// Ce qui mérite de prévenir l'utilisateur, du plus au moins important quand une frame en apporte plusieurs.
const SIGNALS: readonly Signal[] = ['approval', 'failed', 'done']

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
        const task: TaskState = tool.task ?? {
          id: event.id,
          kind: 'other',
          status: 'running',
          description: null,
          progress: null,
          background: false,
          toolUses: null,
          durationMs: null,
        }
        items[index] = {
          ...tool,
          task: {
            ...task,
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
      case 'approval': {
        const { type: _, ...approval } = event
        setApprovals(conversation, [...conversation.approvals, approval])
        signal = strongest(signal, 'approval')
        break
      }
      case 'approvalCancelled':
        setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== event.id))
        break
      case 'context':
        conversation.context = { used: event.used, window: event.window, categories: event.categories }
        break
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
        break
      case 'answered': {
        if (conversation.phase !== 'answering') break
        settleTools(items, 'done')
        // Un tour ouvert par l'agent ne compte qu'à partir de son premier mot : une durée si courte ne dit rien.
        const duration = elapsed(conversation)
        items.push({ kind: 'end', id: crypto.randomUUID(), status: 'completed', error: null, durationMs: duration < 1000 ? null : duration, at: Date.now() })
        conversation.phase = 'finishing'
        signal = strongest(signal, 'done')
        break
      }
      case 'turnEnd': {
        settleTools(items, event.status === 'completed' ? 'done' : 'failed')
        const { status, error } = event
        const shown = conversation.phase === 'finishing' && items.at(-1)?.kind === 'end'
        if (shown && status !== 'completed') items[items.length - 1] = { kind: 'end', id: crypto.randomUUID(), status, error, durationMs: null, at: Date.now() }
        if (!shown) {
          const duration = elapsed(conversation)
          const durationMs = status === 'completed' && duration >= 1000 ? duration : null
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
  const items = [...saved]
  settleTasks(items)
  const last = items.at(-1)
  if (!last || last.kind === 'end' || last.kind === 'error' || last.kind === 'command') return items
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
  const resumeTimers = new Map<string, number>()
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
    if (timers.has(chatId)) return
    const timer = window.setTimeout(() => {
      timers.delete(chatId)
      const conversation = conversations.get(chatId)
      if (!conversation?.loaded) return
      const { sessionId, options, items, context } = conversation
      write(chatId, () => chatSave(chatId, { sessionId, options, items: [...items], context }))
    }, SAVE_DELAY)
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
      if (ended) afterTurn(chatId, conversation)
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

  async function dispatch(chatId: string, conversation: Conversation, place: Place, prompt: string, attachments: Attachment[]) {
    conversation.lastPlace = place
    // Calculé avant que le nouveau message ne s'ajoute : il porte sur le tour précédent.
    const recap = interruptedText(conversation.items.slice(0, lastIndex(conversation.items, (item) => item.kind === 'user')))
    // Les consignes partent tant qu'aucun tour n'a abouti : la session les garde ensuite, `--resume` compris.
    const opening = conversation.sessionId ? undefined : conversation.items.find((item) => item.kind === 'command')
    const command = opening?.kind === 'command' ? opening.command : null
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
    push(conversation, { kind: 'user', id: crypto.randomUUID(), text: prompt, attachments, at: Date.now() })
    save(chatId)
    dispatch(chatId, conversation, place, prompt, attachments)
  }

  // Le message rejoint la réponse en cours ; trop tard (réponse complète), il reste dans la file.
  async function steer(chatId: string, conversation: Conversation, message: Queued) {
    const steered = await agentSteer(chatId, message.prompt, message.attachments).catch(() => false)
    if (!steered) {
      if (conversation.phase === 'idle') afterTurn(chatId, conversation)
      return
    }
    conversation.queue = conversation.queue.filter((item) => item.id !== message.id)
    push(conversation, { kind: 'user', id: message.id, text: message.prompt, attachments: message.attachments, steered: true, at: Date.now() })
    save(chatId)
  }

  // Fin de tour : la reprise après une limite se programme, sinon le message suivant de la file part.
  // Après un arrêt demandé, la file attend un geste de l'utilisateur.
  function afterTurn(chatId: string, conversation: Conversation) {
    const last = conversation.items.at(-1)
    if (conversation.limited && last?.kind === 'end' && last.status === 'failed') {
      if (useGeneralStore().autoResume) scheduleResume(chatId)
      return
    }
    conversation.limited = null
    if (last?.kind === 'end' && last.status === 'stopped') return
    const [next, ...rest] = conversation.queue
    if (!next) return
    conversation.queue = rest
    start(chatId, conversation, next)
  }

  // Pendant un tour, le message attend la fin, ou rejoint la réponse en cours selon Réglages › Général.
  function send(chatId: string, place: Place, prompt: string, attachments: Attachment[]) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded) return
    const message: Queued = { id: crypto.randomUUID(), place, prompt, attachments }
    // L'agent attend : le message part, une reprise programmée devient inutile.
    if (conversation.phase === 'idle') {
      cancelResume(chatId)
      conversation.limited = null
      return start(chatId, conversation, message)
    }
    conversation.queue = [...conversation.queue, message]
    if (conversation.phase === 'answering' && useGeneralStore().followUp === 'steer') steer(chatId, conversation, message)
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
    conversations.delete(chatId)
  }

  return { busy, find, working, itemsOf, create, open, release, setOptions, send, sendNow, unqueue, scheduleResume, cancelResume, begin, warm, approve, stop, stopTask, rewind, remove }
})
