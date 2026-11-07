import { Channel, invoke } from '@tauri-apps/api/core'
import type { BrowserEvent } from '@/ipc/bindings/BrowserEvent'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import type { ColorScheme } from '@/ipc/bindings/ColorScheme'
import type { PaneRect } from '@/ipc/bindings/PaneRect'
import type { Viewport } from '@/ipc/bindings/Viewport'

// Un seul flux pour tous les onglets ; rend ceux déjà ouverts (ils survivent au rechargement de la page).
export function browserWatch(onEvent: (event: BrowserEvent) => void) {
  return invoke<BrowserTab[]>('browser_watch', { onEvent: new Channel<BrowserEvent>(onEvent) })
}

// `project` : dossier du projet de la session, dont la page partage les cookies.
export function browserOpen(chatId: string, project: string | null, url: string) {
  return invoke<BrowserTab>('browser_open', { chatId, project, url })
}

export function browserClose(id: string) {
  return invoke<void>('browser_close', { id })
}

export function browserCloseChat(chatId: string) {
  return invoke<void>('browser_close_chat', { chatId })
}

export function browserSelect(chatId: string, id: string) {
  return invoke<void>('browser_select', { chatId, id })
}

export function browserNavigate(id: string, url: string) {
  return invoke<void>('browser_navigate', { id, url })
}

export function browserHistory(id: string, step: 'back' | 'forward' | 'reload' | 'stop') {
  return invoke<void>('browser_history', { id, step })
}

// Zone du volet en points de la fenêtre ; null retire la page de l'écran.
export function browserPlace(id: string, rect: PaneRect | null) {
  return invoke<void>('browser_place', { id, rect })
}

export function browserEmulate(id: string, viewport: Viewport | null, colorScheme: ColorScheme | null) {
  return invoke<void>('browser_emulate', { id, viewport, colorScheme })
}

// Image de la page (data:), posée à sa place pendant qu'un menu passe par-dessus.
export function browserSnapshot(id: string) {
  return invoke<string>('browser_snapshot', { id })
}

export function browserClearData(chatId: string, project: string | null) {
  return invoke<void>('browser_clear_data', { chatId, project })
}
