import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'

export function systemLocales() {
  return invoke<string[]>('system_locales')
}

export function appVersion() {
  return getVersion()
}

// Seule la fenêtre macOS est transparente (tauri.macos.conf.json) : les styles en dépendent.
export function isMacosApp() {
  return isTauri() && navigator.userAgent.includes('Mac')
}
