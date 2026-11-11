import { Channel, invoke } from '@tauri-apps/api/core'
import type { TerminalEvent } from '@/ipc/bindings/TerminalEvent'
import type { Place } from '@/stores/conversations'

// Un shell là où travaille l'agent du chat. La sortie arrive sur onEvent, jusqu'à `exit`.
export function terminalOpen(chatId: string, place: Place, cols: number, rows: number, onEvent: (event: TerminalEvent) => void) {
  const channel = new Channel<TerminalEvent>(onEvent)
  return invoke<number>('terminal_open', { chatId, ...place, cols, rows, onEvent: channel })
}

// Commande d'un bloc de code, lancée sur un clic dans le dossier de la session ; sortie sur onEvent jusqu'à `exit`.
export function terminalRun(chatId: string, place: Place, command: string, onEvent: (event: TerminalEvent) => void) {
  const channel = new Channel<TerminalEvent>(onEvent)
  return invoke<number>('terminal_run', { chatId, ...place, command, onEvent: channel })
}

export function terminalStop(id: number) {
  return invoke<void>('terminal_stop', { id })
}

export function terminalWrite(id: number, data: string) {
  return invoke<void>('terminal_write', { id, data })
}

export function terminalResize(id: number, cols: number, rows: number) {
  return invoke<void>('terminal_resize', { id, cols, rows })
}

// Nom de la commande en cours, null quand le shell attend à son invite.
export function terminalBusy(id: number) {
  return invoke<string | null>('terminal_busy', { id })
}

export function terminalClose(id: number) {
  return invoke<void>('terminal_close', { id })
}

export function terminalCloseChat(chatId: string) {
  return invoke<void>('terminal_close_chat', { chatId })
}
