import { defineStore } from 'pinia'
import { shallowReactive } from 'vue'
import { agentSend, agentStop, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AppError } from '@/ipc/bindings/AppError'
import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { TurnStatus } from '@/ipc/bindings/TurnStatus'

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
  running: boolean
  // Remplacé à chaque frame, jamais muté : un élément modifié est un nouvel objet.
  items: readonly ChatItem[]
}

function lastIndexOfTool(items: ChatItem[], id: string) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item?.kind === 'tool' && item.id === id) return i
  }
  return -1
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
        const settled = event.status === 'completed' ? 'done' : 'failed'
        items.forEach((item, i) => {
          if (item.kind === 'tool' && item.status === 'running') items[i] = { ...item, status: settled }
        })
        const { status, error, durationMs } = event
        items.push({ kind: 'end', id: crypto.randomUUID(), status, error, durationMs })
        conversation.running = false
        break
      }
    }
  }
  conversation.items = items
}

// Conversations par onglet de chat, en mémoire. Les événements d'agent sont appliqués une fois par frame.
export const useConversationsStore = defineStore('conversations', () => {
  const conversations = shallowReactive(new Map<string, Conversation>())
  const pending = new Map<string, AgentEvent[]>()
  let frame = 0

  function find(chatId: string) {
    return conversations.get(chatId)
  }

  function ensure(chatId: string) {
    let conversation = conversations.get(chatId)
    if (!conversation) {
      conversation = shallowReactive<Conversation>({ agent: 'claude', sessionId: null, running: false, items: [] })
      conversations.set(chatId, conversation)
    }
    return conversation
  }

  function flush() {
    frame = 0
    for (const [chatId, events] of pending) {
      const conversation = conversations.get(chatId)
      if (conversation) apply(conversation, events)
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

  async function send(chatId: string, cwd: string, prompt: string) {
    const conversation = ensure(chatId)
    if (conversation.running) return
    push(conversation, { kind: 'user', id: crypto.randomUUID(), text: prompt })
    conversation.running = true
    const { agent, sessionId } = conversation
    try {
      await agentSend({ chatId, agent, cwd, prompt, sessionId }, (event) => queue(chatId, event))
    } catch (error) {
      conversation.running = false
      const appError: AppError = isAppError(error) ? error : { kind: 'io', message: String(error) }
      push(conversation, { kind: 'error', id: crypto.randomUUID(), error: appError })
    }
  }

  // Le tour se termine quand l'agent est sorti : turnEnd arrive avec le statut « stopped ».
  function stop(chatId: string) {
    if (conversations.get(chatId)?.running) agentStop(chatId).catch(() => {})
  }

  function dispose(chatId: string) {
    stop(chatId)
    conversations.delete(chatId)
    pending.delete(chatId)
  }

  return { find, send, stop, dispose }
})
