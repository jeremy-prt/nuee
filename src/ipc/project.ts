import { invoke } from '@tauri-apps/api/core'
import type { ProjectIcons } from '@/ipc/bindings/ProjectIcons'

// Icône trouvée dans le dossier et image importée : le mode du projet dit laquelle s'affiche.
export function projectIcon(id: string, path: string) {
  return invoke<ProjectIcons>('project_icon', { id, path })
}

// Copie l'image dans le dossier de l'app et la renvoie en `data:`.
export function projectIconSet(id: string, source: string) {
  return invoke<string>('project_icon_set', { id, source })
}

export function projectIconReset(id: string) {
  return invoke<void>('project_icon_reset', { id })
}

// Chemins relatifs au dossier de la session (son worktree, sinon le projet `path`), séparés par « / » : ceux que
// git suit ou ne cache pas (`ignored` : avec ceux qu'il ignore, hors dépendances et builds), sinon un parcours borné.
export function projectFiles(chatId: string, path: string, ignored: boolean) {
  return invoke<string[]>('project_files', { chatId, path, ignored })
}

export function projectReveal(path: string) {
  return invoke<void>('project_reveal', { path })
}
