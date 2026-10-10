import { invoke } from '@tauri-apps/api/core'

export function powerKeepAwake(on: boolean) {
  return invoke<void>('power_keep_awake', { on })
}
