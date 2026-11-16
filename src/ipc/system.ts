import { getVersion } from '@tauri-apps/api/app'
import { homeDir } from '@tauri-apps/api/path'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Image } from '@tauri-apps/api/image'
import { writeImage } from '@tauri-apps/plugin-clipboard-manager'
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

// Navigateur par défaut, http(s) seulement (vérifié par Rust).
export function openWebLink(url: string) {
  return invoke<void>('system_open_link', { url })
}

// Presse-papiers natif : celui de WebKit refuse une image écrite depuis un menu (hors du geste du clic), sans erreur.
export async function copyImagePixels(rgba: Uint8Array, width: number, height: number) {
  const image = await Image.new(rgba, width, height)
  try {
    await writeImage(image)
  } finally {
    await image.close()
  }
}

export function isTauriApp() {
  return isTauri()
}

// Seule la fenêtre macOS est transparente (tauri.macos.conf.json) : les styles en dépendent.
export function isMacosApp() {
  return isTauri() && navigator.userAgent.includes('Mac')
}

// Vide si le système ne le donne pas.
export function systemMachineName() {
  return invoke<string>('system_machine_name')
}

export function homeFolder() {
  return homeDir()
}
