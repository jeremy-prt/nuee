import { defineStore } from 'pinia'
import { shallowReactive } from 'vue'
import { agentApprove, agentSend, agentStop, agentWarm, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AppError } from '@/ipc/bindings/AppError'
import type { ChatSummary } from '@/ipc/bindings/ChatSummary'
import type { SessionSpec } from '@/ipc/bindings/SessionSpec'
import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { TurnStatus } from '@/ipc/bindings/TurnStatus'
import { chatContent, chatCreate, chatDelete, chatSave } from '@/ipc/chat'
import { useCatalogStore } from '@/stores/catalog'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'text'; id: string; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      tool: ToolKind
      summary: string | null
      output: string | null
      status: 'running' | 'done' | 'failed'
    }
  | { kind: 'end'; id: string; status: TurnStatus; error: string | null; durationMs: number | null }
  | { kind: 'error'; id: string; error: AppError }

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
  // Temps passé à attendre une réponse à une demande d'autorisation : il ne compte pas dans la durée.
  pausedMs: number
  pausedAt: number | null
  // Message envoyé pendant que l'agent range son tour : il part dès que le tour se clôt.
  queued: { cwd: string | null; prompt: string } | null
  // Demandes d'autorisation (mode Auto) en attente de réponse, la plus ancienne d'abord. Non enregistrées.
  approvals: readonly Approval[]
  // Faux tant que l'historique n'est pas lu : envoyer avant écraserait la conversation chargée.
  loaded: boolean
  // Remplacé à chaque frame, jamais muté : un élément modifié est un nouvel objet.
  items: readonly ChatItem[]
}

export const DEFAULT_OPTIONS: TurnOptions = { mode: 'bypass', model: null, effort: null }

const SAVE_DELAY = 600

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

// L'agent repart après sa réponse (un hook lui a demandé de continuer) : la fin affichée était prématurée.
function resume(conversation: Conversation, items: ChatItem[]) {
  if (conversation.phase !== 'finishing') return
  if (items.at(-1)?.kind === 'end') items.pop()
  conversation.phase = 'answering'
}

// Renvoie vrai quand le tour s'est clos.
function apply(conversation: Conversation, events: AgentEvent[]) {
  const items = [...conversation.items]
  let ended = false
  for (const event of events) {
    if (event.type === 'text' || event.type === 'tool') resume(conversation, items)
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
      case 'tool': {
        const index = lastIndexOfTool(items, event.id)
        const tool = items[index]
        if (tool?.kind === 'tool') {
          items[index] = { ...tool, name: event.name, tool: event.kind, summary: event.summary ?? tool.summary }
        } else {
          const { id, name, kind, summary } = event
          items.push({ kind: 'tool', id, name, tool: kind, summary, output: null, status: 'running' })
        }
        break
      }
      case 'toolResult': {
        const index = lastIndexOfTool(items, event.id)
        const tool = items[index]
        if (tool?.kind === 'tool') items[index] = { ...tool, output: event.output, status: event.isError ? 'failed' : 'done' }
        break
      }
      case 'approval': {
        const { type: _, ...approval } = event
        setApprovals(conversation, [...conversation.approvals, approval])
        break
      }
      case 'approvalCancelled':
        setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== event.id))
        break
      case 'answered': {
        if (conversation.phase !== 'answering') break
        settleTools(items, 'done')
        items.push({ kind: 'end', id: crypto.randomUUID(), status: 'completed', error: null, durationMs: elapsed(conversation) })
        conversation.phase = 'finishing'
        break
      }
      case 'turnEnd': {
        settleTools(items, event.status === 'completed' ? 'done' : 'failed')
        const { status, error } = event
        const shown = conversation.phase === 'finishing' && items.at(-1)?.kind === 'end'
        if (shown && status !== 'completed') items[items.length - 1] = { kind: 'end', id: crypto.randomUUID(), status, error, durationMs: null }
        if (!shown) {
          const durationMs = status === 'completed' ? elapsed(conversation) : null
          items.push({ kind: 'end', id: crypto.randomUUID(), status, error, durationMs })
        }
        conversation.phase = 'idle'
        setApprovals(conversation, [])
        ended = true
        break
      }
    }
  }
  conversation.items = items
  return ended
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
  const last = saved.at(-1)
  if (!last || last.kind === 'end' || last.kind === 'error') return saved
  const items = [...saved]
  settleTools(items, 'failed')
  items.push({ kind: 'end', id: crypto.randomUUID(), status: 'stopped', error: null, durationMs: null })
  return items
}

// Conversations par chat. Les événements d'agent sont appliqués une fois par frame, l'historique
// est enregistré peu après chaque changement.
export const useConversationsStore = defineStore('conversations', () => {
  const catalog = useCatalogStore()
  const conversations = shallowReactive(new Map<string, Conversation>())
  const pending = new Map<string, AgentEvent[]>()
  const timers = new Map<string, number>()
  const writes = new Map<string, Promise<void>>()
  let frame = 0

  function blank(agent: AgentKind, loaded: boolean) {
    return shallowReactive<Conversation>({
      agent,
      sessionId: null,
      options: { ...DEFAULT_OPTIONS },
      phase: 'idle',
      startedAt: 0,
      pausedMs: 0,
      pausedAt: null,
      queued: null,
      approvals: [],
      loaded,
      items: [],
    })
  }

  // Les écritures d'un chat passent l'une après l'autre : une sauvegarde ancienne n'écrase jamais une récente.
  function write(chatId: string, task: () => Promise<void>) {
    const next = (writes.get(chatId) ?? Promise.resolve()).then(task).catch((error) => console.error('historique', error))
    writes.set(chatId, next)
  }

  function save(chatId: string) {
    clearTimeout(timers.get(chatId))
    const timer = window.setTimeout(() => {
      timers.delete(chatId)
      const conversation = conversations.get(chatId)
      if (!conversation?.loaded) return
      const { sessionId, options, items } = conversation
      write(chatId, () => chatSave(chatId, { sessionId, options, items: [...items] }))
    }, SAVE_DELAY)
    timers.set(chatId, timer)
  }

  function find(chatId: string) {
    return conversations.get(chatId)
  }

  function create(chat: ChatSummary) {
    conversations.set(chat.id, blank(chat.agent, true))
    write(chat.id, () => chatCreate(chat))
  }

  // Lit l'historique au premier affichage du chat.
  function open(chatId: string, agent: AgentKind) {
    if (conversations.has(chatId)) return
    const conversation = blank(agent, false)
    conversations.set(chatId, conversation)
    chatContent(chatId)
      .then((content) => {
        if (!content) return
        conversation.sessionId = content.sessionId
        conversation.options = content.options
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
    conversation.options = options
    save(chatId)
  }

  function flush() {
    frame = 0
    for (const [chatId, events] of pending) {
      const conversation = conversations.get(chatId)
      if (!conversation) continue
      const ended = apply(conversation, events)
      save(chatId)
      const queued = conversation.queued
      if (ended && queued) {
        conversation.queued = null
        dispatch(chatId, conversation, queued.cwd, queued.prompt)
      }
    }
    pending.clear()
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

  function spec(chatId: string, conversation: Conversation, cwd: string | null): SessionSpec {
    const { agent, sessionId } = conversation
    return { chatId, agent, cwd, sessionId, options: catalog.resolve(agent, conversation.options) }
  }

  async function dispatch(chatId: string, conversation: Conversation, cwd: string | null, prompt: string) {
    // Calculé avant que le nouveau message ne s'ajoute : il porte sur le tour précédent.
    const recap = interruptedText(conversation.items.slice(0, lastIndex(conversation.items, (item) => item.kind === 'user')))
    conversation.phase = 'answering'
    conversation.startedAt = performance.now()
    conversation.pausedMs = 0
    conversation.pausedAt = null
    try {
      await agentSend(spec(chatId, conversation, cwd), prompt, recap, (event) => queue(chatId, event))
    } catch (error) {
      conversation.phase = 'idle'
      const appError: AppError = isAppError(error) ? error : { kind: 'io', message: String(error) }
      push(conversation, { kind: 'error', id: crypto.randomUUID(), error: appError })
      save(chatId)
    }
  }

  // cwd null : chat sans projet, Rust lui donne un dossier vide à lui.
  function send(chatId: string, cwd: string | null, prompt: string) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded || conversation.phase === 'answering' || conversation.queued) return
    push(conversation, { kind: 'user', id: crypto.randomUUID(), text: prompt })
    save(chatId)
    if (conversation.phase === 'finishing') conversation.queued = { cwd, prompt }
    else dispatch(chatId, conversation, cwd, prompt)
  }

  // Appelé quand l'utilisateur commence à écrire ; Rust ignore l'appel si le process tourne déjà.
  function warm(chatId: string, cwd: string | null) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded || conversation.phase !== 'idle') return
    agentWarm(spec(chatId, conversation, cwd)).catch(() => {})
  }

  function approve(chatId: string, requestId: string, allow: boolean) {
    const conversation = conversations.get(chatId)
    if (!conversation) return
    setApprovals(conversation, conversation.approvals.filter((approval) => approval.id !== requestId))
    agentApprove(chatId, requestId, allow).catch(() => {})
  }

  // Le process reste ouvert : turnEnd arrive aussitôt avec le statut « stopped ».
  function stop(chatId: string) {
    if (conversations.get(chatId)?.phase === 'answering') agentStop(chatId).catch(() => {})
  }

  function remove(chatId: string) {
    stop(chatId)
    clearTimeout(timers.get(chatId))
    timers.delete(chatId)
    conversations.delete(chatId)
    pending.delete(chatId)
    write(chatId, () => chatDelete(chatId))
  }

  return { find, create, open, setOptions, send, warm, approve, stop, remove }
})
