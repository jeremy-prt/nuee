import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function appQuit() {
  return invoke<void>('app_quit')
}

// Rust ne l'envoie que si un agent travaille encore, avec le nombre de chats concernés.
export function onQuitRequested(handler: (busy: number) => void) {
  return listen<number>('app-quit-requested', (event) => handler(event.payload))
}
