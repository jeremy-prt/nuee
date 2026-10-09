import { invoke } from '@tauri-apps/api/core'

export function systemLocales() {
  return invoke<string[]>('system_locales')
}
