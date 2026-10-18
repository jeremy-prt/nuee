import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window'

// Sans effet hors macOS : seule cette fenêtre est transparente.
export function windowSetBlur(radius: number) {
  return invoke<void>('window_set_blur', { radius })
}

// Zoom natif de la webview : tout l'intérieur grandit, mais pas les boutons de fenêtre macOS.
export function windowSetZoom(factor: number) {
  return getCurrentWebview().setZoom(factor)
}

// Un seul rebond de l'icône du Dock, sans effet si l'app est déjà au premier plan.
export function windowRequestAttention() {
  return getCurrentWindow().requestUserAttention(UserAttentionType.Informational)
}

export function onWindowFocus(handler: (focused: boolean) => void) {
  return getCurrentWindow().onFocusChanged((event) => handler(event.payload))
}
