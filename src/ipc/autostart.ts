import { invoke } from '@tauri-apps/api/core'

// null : indisponible ici (sous `tauri dev` sur macOS, l'app n'est pas empaquetée).
export function autostartEnabled() {
  return invoke<boolean | null>('autostart_enabled')
}

export function autostartSet(on: boolean) {
  return invoke<void>('autostart_set', { on })
}
