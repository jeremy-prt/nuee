import { invoke } from '@tauri-apps/api/core'

// Copie l'image dans le dossier des fonds de l'app et renvoie le chemin de la copie.
export function backgroundImport(path: string) {
  return invoke<string>('background_import', { path })
}

export function backgroundRemove() {
  return invoke<void>('background_remove')
}
