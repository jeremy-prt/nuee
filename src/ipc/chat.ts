import { invoke } from '@tauri-apps/api/core'
import type { ChatContent } from '@/ipc/bindings/ChatContent'
import type { ChatSummary } from '@/ipc/bindings/ChatSummary'

export function chatList() {
  return invoke<ChatSummary[]>('chat_list')
}

export function chatCreate(chat: ChatSummary) {
  return invoke<void>('chat_create', { chat })
}

// null tant que le chat n'a jamais été enregistré.
export function chatContent(id: string) {
  return invoke<ChatContent | null>('chat_content', { id })
}

export function chatSave(id: string, content: ChatContent) {
  return invoke<void>('chat_save', { id, content })
}

export function chatDelete(id: string) {
  return invoke<void>('chat_delete', { id })
}
