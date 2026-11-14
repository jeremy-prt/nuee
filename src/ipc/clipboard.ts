import { readText } from '@tauri-apps/plugin-clipboard-manager'

// Texte du presse-papiers lu par Tauri : celui de WebKit demande une confirmation à chaque lecture.
export function clipboardText() {
  return readText().catch(() => '')
}
