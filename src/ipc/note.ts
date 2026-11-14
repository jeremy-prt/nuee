import { invoke } from '@tauri-apps/api/core'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Note } from '@/ipc/bindings/Note'
import type { NoteInput } from '@/ipc/bindings/NoteInput'

// Du plus récemment modifié au plus ancien.
export function noteList() {
  return invoke<Note[]>('note_list')
}

// Crée ou modifie ; rend la note enregistrée, slug compris.
export function noteSave(note: NoteInput) {
  return invoke<Note>('note_save', { note })
}

export function noteDelete(id: string) {
  return invoke<void>('note_delete', { id })
}

// Résumé de la session par un appel unique de l'agent, enregistré sous `id`.
export function noteSummarize(args: { id: string; agent: AgentKind; headings: string[]; focus: string; transcript: string; projectId: string | null; chatId: string }) {
  return invoke<Note>('note_summarize', args)
}
