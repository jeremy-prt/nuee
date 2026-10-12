import { invoke } from '@tauri-apps/api/core'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { ChatContent } from '@/ipc/bindings/ChatContent'
import type { ChatSummary } from '@/ipc/bindings/ChatSummary'
import type { ChatText } from '@/ipc/bindings/ChatText'

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

// Rend le titre enregistré : celui de l'agent, ou `seed` s'il n'a pas su répondre.
export function chatTitle(id: string, agent: AgentKind, prompt: string, seed: string) {
  return invoke<string>('chat_title', { id, agent, prompt, seed })
}

// Avant le premier message seulement. path : worktree existant rejoint ; null avec worktree : le sien.
export function chatSetWorktree(id: string, worktree: boolean, path: string | null) {
  return invoke<void>('chat_set_worktree', { id, worktree, path })
}

// Rend la date d'archivage enregistrée, null au retour dans l'historique.
export function chatSetArchived(ids: string[], archived: boolean) {
  return invoke<number | null>('chat_set_archived', { ids, archived })
}

export function chatArchivedTexts() {
  return invoke<ChatText[]>('chat_archived_texts')
}

// Rend le chemin du worktree du chat s'il a été gardé parce qu'il avait des changements non commités.
export function chatDelete(id: string) {
  return invoke<string | null>('chat_delete', { id })
}
