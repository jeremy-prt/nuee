import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export function systemLocales() {
  return invoke<string[]>('system_locales')
}

export function appVersion() {
  return getVersion()
}

// Limité aux pages du dépôt listées dans la capability (opener:allow-open-url).
export function openGithubPage(url: string) {
  return openUrl(url)
}

export function isTauriApp() {
  return isTauri()
}

// Seule la fenêtre macOS est transparente (tauri.macos.conf.json) : les styles en dépendent.
export function isMacosApp() {
  return isTauri() && navigator.userAgent.includes('Mac')
}
