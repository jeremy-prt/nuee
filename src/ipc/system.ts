import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export function systemLocales() {
  return invoke<string[]>('system_locales')
}

export function appVersion() {
  return getVersion()
}

// Limité aux pages de release du dépôt par la capability (opener:allow-open-url).
export function openReleasePage(url: string) {
  return openUrl(url)
}

export function isTauriApp() {
  return isTauri()
}

// Seule la fenêtre macOS est transparente (tauri.macos.conf.json) : les styles en dépendent.
export function isMacosApp() {
  return isTauri() && navigator.userAgent.includes('Mac')
}
