import { invoke } from '@tauri-apps/api/core'

// Sans effet hors macOS : seule cette fenêtre est transparente.
export function windowSetBlur(radius: number) {
  return invoke<void>('window_set_blur', { radius })
}
