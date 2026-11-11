import { Channel, invoke } from '@tauri-apps/api/core'
import type { DirListing } from '@/ipc/bindings/DirListing'
import type { Editor } from '@/ipc/bindings/Editor'
import type { EditorApp } from '@/ipc/bindings/EditorApp'
import type { FileContent } from '@/ipc/bindings/FileContent'
import type { FileList } from '@/ipc/bindings/FileList'
import type { FileMark } from '@/ipc/bindings/FileMark'
import type { FileSaved } from '@/ipc/bindings/FileSaved'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import type { SearchOptions } from '@/ipc/bindings/SearchOptions'
import type { SearchResults } from '@/ipc/bindings/SearchResults'

// Rust choisit le dossier de la session `place` (son worktree, sinon le projet, sinon son dossier de « Cet
// ordinateur ») ; `file` y est relatif, tout chemin qui en sort est refusé.

export function filesList(place: FilesPlace) {
  return invoke<FileList>('files_list', { place })
}

// Un seul dossier (`dir` relatif, vide pour la racine), sans ce que git ignore.
export function filesDir(place: FilesPlace, dir: string) {
  return invoke<DirListing>('files_dir', { place, dir })
}

// État git des fichiers (modifié, nouveau, renommé), pour colorer l'arbre.
export function filesMarks(place: FilesPlace) {
  return invoke<FileMark[]>('files_marks', { place })
}

export function filesRead(place: FilesPlace, file: string) {
  return invoke<FileContent>('files_read', { place, file })
}

// Version du fichier sur le disque, null s'il a disparu.
export function filesStat(place: FilesPlace, file: string) {
  return invoke<string | null>('files_stat', { place, file })
}

// `expected` : version sur laquelle porte l'édition ; null écrase ce qu'il y a sur le disque.
export function filesWrite(place: FilesPlace, file: string, text: string, expected: string | null) {
  return invoke<FileSaved>('files_write', { place, file, text, expected })
}

export function filesEditors() {
  return invoke<EditorApp[]>('files_editors')
}

export function filesFinderIcon() {
  return invoke<string | null>('files_finder_icon')
}

export function filesOpenEditor(place: FilesPlace, file: string, editor: Editor) {
  return invoke<void>('files_open_editor', { place, file, editor })
}

export function filesReveal(place: FilesPlace, file: string) {
  return invoke<void>('files_reveal', { place, file })
}

// `parent` : dossier relatif, vide pour le dossier de la session. Rend le chemin relatif créé.
export function filesCreate(place: FilesPlace, parent: string, name: string, dir: boolean) {
  return invoke<string>('files_create', { place, parent, name, dir })
}

export function filesRename(place: FilesPlace, file: string, name: string) {
  return invoke<string>('files_rename', { place, file, name })
}

// Mis à la corbeille du système.
export function filesTrash(place: FilesPlace, file: string) {
  return invoke<void>('files_trash', { place, file })
}

// `cut` : déplacé dans `parent`, sinon copié sous un nom libre (« nom 2.ext »).
export function filesPaste(place: FilesPlace, file: string, parent: string, cut: boolean) {
  return invoke<string>('files_paste', { place, file, parent, cut })
}

// `onChange` à chaque changement du dossier sur le disque (regroupés par 150 ms). Rend l'id pour `filesUnwatch`.
export function filesWatch(place: FilesPlace, onChange: () => void) {
  const channel = new Channel<null>()
  channel.onmessage = onChange
  return invoke<number>('files_watch', { place, onChange: channel })
}

export function filesUnwatch(id: number) {
  return invoke<void>('files_unwatch', { id })
}

// Lignes qui contiennent le texte : `git grep`, sinon un parcours sans expression régulière.
export function filesSearch(place: FilesPlace, options: SearchOptions) {
  return invoke<SearchResults>('files_search', { place, options })
}
