import { defineStore } from 'pinia'
import { shallowReactive } from 'vue'
import { agentSend, agentStop, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AppError } from '@/ipc/bindings/AppError'
import type { ChatSummary } from '@/ipc/bindings/ChatSummary'
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

export interface Conversation {
  agent: AgentKind
  sessionId: string | null
  options: TurnOptions
  running: boolean
  // Faux tant que l'historique n'est pas lu : envoyer avant écraserait la conversation chargée.
  loaded: boolean
  // Remplacé à chaque frame, jamais muté : un élément modifié est un nouvel objet.
  items: readonly ChatItem[]
}

export const DEFAULT_OPTIONS: TurnOptions = { mode: 'bypass', model: null, effort: null }

const SAVE_DELAY = 600

function lastIndexOfTool(items: ChatItem[], id: string) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item?.kind === 'tool' && item.id === id) return i
  }
  return -1
}

function settleTools(items: ChatItem[], status: 'done' | 'failed') {
  items.forEach((item, i) => {
    if (item.kind === 'tool' && item.status === 'running') items[i] = { ...item, status }
  })
}

function apply(conversation: Conversation, events: AgentEvent[]) {
  const items = [...conversation.items]
  for (const event of events) {
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
      case 'turnEnd': {
        settleTools(items, event.status === 'completed' ? 'done' : 'failed')
        const { status, error, durationMs } = event
        items.push({ kind: 'end', id: crypto.randomUUID(), status, error, durationMs })
        conversation.running = false
        break
      }
    }
  }
  conversation.items = items
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
    return shallowReactive<Conversation>({ agent, sessionId: null, options: { ...DEFAULT_OPTIONS }, running: false, loaded, items: [] })
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
      apply(conversation, events)
      save(chatId)
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

  // cwd null : chat sans projet, Rust lui donne un dossier vide à lui.
  async function send(chatId: string, cwd: string | null, prompt: string) {
    const conversation = conversations.get(chatId)
    if (!conversation?.loaded || conversation.running) return
    push(conversation, { kind: 'user', id: crypto.randomUUID(), text: prompt })
    conversation.running = true
    save(chatId)
    const { agent, sessionId } = conversation
    const options = catalog.resolve(agent, conversation.options)
    try {
      await agentSend({ chatId, agent, cwd, prompt, sessionId, options }, (event) => queue(chatId, event))
    } catch (error) {
      conversation.running = false
      const appError: AppError = isAppError(error) ? error : { kind: 'io', message: String(error) }
      push(conversation, { kind: 'error', id: crypto.randomUUID(), error: appError })
      save(chatId)
    }
  }

  // Le tour se termine quand l'agent est sorti : turnEnd arrive avec le statut « stopped ».
  function stop(chatId: string) {
    if (conversations.get(chatId)?.running) agentStop(chatId).catch(() => {})
  }

  function remove(chatId: string) {
    stop(chatId)
    clearTimeout(timers.get(chatId))
    timers.delete(chatId)
    conversations.delete(chatId)
    pending.delete(chatId)
    write(chatId, () => chatDelete(chatId))
  }

  return { find, create, open, setOptions, send, stop, remove }
})
