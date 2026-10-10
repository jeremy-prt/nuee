import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'

// Sans effet hors macOS : seule cette fenêtre est transparente.
export function windowSetBlur(radius: number) {
  return invoke<void>('window_set_blur', { radius })
}

// Zoom natif de la webview : tout l'intérieur grandit, mais pas les boutons de fenêtre macOS.
export function windowSetZoom(factor: number) {
  return getCurrentWebview().setZoom(factor)
}
