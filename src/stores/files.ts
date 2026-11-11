import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { DirEntry } from '@/ipc/bindings/DirEntry'
import type { EditorApp } from '@/ipc/bindings/EditorApp'
import type { GitMark } from '@/ipc/bindings/GitMark'
import { filesEditors, filesFinderIcon } from '@/ipc/files'

// Fichier ou dossier visé par un menu ; le dossier de la session a le chemin vide.
export interface FileTarget {
  path: string
  folder: boolean
}

export type Editing = { kind: 'create'; parent: string; dir: boolean } | { kind: 'rename'; path: string; folder: boolean }

interface Browse {
  // Onglets de l'éditeur, comme monocode : un clic ouvre en aperçu (remplacé au clic suivant), un double clic ou une
  // modification le garde.
  tabs: string[]
  open: string | null
  preview: string | null
  // Ligne à montrer à l'ouverture (résultat de recherche), lue une fois par l'éditeur.
  goto: { path: string; line: number } | null
  expanded: Set<string>
  rootOpen: boolean
  searching: boolean
  selected: string | null
  editing: Editing | null
  // Dossiers déjà lus (`''` : la racine), gardés pour réafficher l'arbre aussitôt, relus à chaque changement.
  dirs: Map<string, DirEntry[]>
  root: string | null
  // État git par fichier : l'arbre colore fichiers et dossiers comme monocode.
  marks: Map<string, GitMark>
  selectedFolder: boolean
  // Changement sur le disque signalé par la surveillance du dossier.
  disk: number
}

export const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

const VIEW_KEY = 'nuee.files.view'
const WIDTH_KEY = 'nuee.files.explorer'

function stored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return valid(value) ? value : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Préférence de confort : perdue au redémarrage si le stockage refuse.
  }
}

export const EXPLORER = { min: 200, max: 420, defaultSize: 260 }

// Ce que le volet Explorateur montre dans chaque session : il est recréé à chaque changement de volet ou d'onglet.
export const useFilesStore = defineStore('files', () => {
  const sessions = reactive(new Map<string, Browse>())

  function of(chatId: string): Browse {
    let browse = sessions.get(chatId)
    if (!browse) {
      sessions.set(chatId, {
        tabs: [],
        open: null,
        preview: null,
        goto: null,
        expanded: new Set(),
        rootOpen: true,
        searching: false,
        selected: null,
        editing: null,
        dirs: new Map(),
        root: null,
        marks: new Map(),
        selectedFolder: false,
        disk: 0,
      })
      browse = sessions.get(chatId)!
    }
    return browse
  }

  // Lu par la barre de titre : ne crée pas l'état d'une session qui n'a jamais ouvert le volet.
  function editing(chatId: string) {
    return (sessions.get(chatId)?.tabs.length ?? 0) > 0
  }

  function openFile(chatId: string, path: string, options: { pin?: boolean; line?: number } = {}) {
    const browse = of(chatId)
    if (!browse.tabs.includes(path)) {
      const preview = browse.preview && browse.tabs.indexOf(browse.preview)
      if (!options.pin && typeof preview === 'number' && preview >= 0) browse.tabs.splice(preview, 1, path)
      else browse.tabs.splice(browse.open ? browse.tabs.indexOf(browse.open) + 1 : browse.tabs.length, 0, path)
      browse.preview = options.pin ? browse.preview : path
    } else if (options.pin && browse.preview === path) browse.preview = null
    browse.open = path
    browse.selected = path
    browse.goto = options.line ? { path, line: options.line } : null
  }

  function pin(chatId: string, path: string) {
    const browse = of(chatId)
    if (browse.preview === path) browse.preview = null
  }

  function closeFile(chatId: string, path: string) {
    const browse = of(chatId)
    const index = browse.tabs.indexOf(path)
    if (index < 0) return
    browse.tabs.splice(index, 1)
    if (browse.preview === path) browse.preview = null
    if (browse.open === path) browse.open = browse.tabs[Math.min(index, browse.tabs.length - 1)] ?? null
  }

  // Chemin renommé ou déplacé (`to` null : supprimé) : les onglets suivent, sous-dossiers compris.
  function moved(chatId: string, from: string, to: string | null) {
    const browse = of(chatId)
    const map = (path: string | null) =>
      path === from ? to : path?.startsWith(`${from}/`) ? (to === null ? null : to + path.slice(from.length)) : path
    for (const path of [...browse.tabs]) {
      const next = map(path)
      if (next === null) closeFile(chatId, path)
      else if (next !== path) browse.tabs.splice(browse.tabs.indexOf(path), 1, next)
    }
    browse.open = map(browse.open) ?? browse.open
    browse.preview = map(browse.preview)
    browse.selected = map(browse.selected)
  }

  // Aperçu ou texte pour un markdown ou un SVG, gardé pour tous les fichiers comme monocode.
  const view = ref<'preview' | 'source'>(stored(VIEW_KEY, 'preview', (value): value is 'preview' | 'source' => value === 'preview' || value === 'source'))
  function setView(next: 'preview' | 'source') {
    view.value = next
    save(VIEW_KEY, next)
  }

  const explorerWidth = ref(stored(WIDTH_KEY, EXPLORER.defaultSize, (value): value is number => typeof value === 'number'))
  function setExplorerWidth(width: number) {
    explorerWidth.value = Math.round(Math.min(EXPLORER.max, Math.max(EXPLORER.min, width)))
    save(WIDTH_KEY, explorerWidth.value)
  }

  // Largeur réelle à côté de l'éditeur : jamais plus de 45 % du panneau, l'éditeur garde la place de lire.
  function explorerShown(dock: number) {
    return Math.round(Math.min(explorerWidth.value, Math.max(EXPLORER.min, dock * 0.45)))
  }

  // Volet ouvert par son raccourci : l'arbre prend le focus une fois rendu et lu. Demande oubliée s'il n'est pas là à
  // temps (session sans dossier, recherche ouverte), sinon il prendrait le focus bien plus tard.
  const wantsFocus = ref(false)
  let focusTimer = 0
  function requestFocus() {
    wantsFocus.value = true
    clearTimeout(focusTimer)
    focusTimer = window.setTimeout(() => (wantsFocus.value = false), 2000)
  }

  // Couper ou copier : collé ensuite dans un dossier de la même session.
  const clipboard = ref<{ chatId: string; target: FileTarget; cut: boolean } | null>(null)

  // Lus une fois : un éditeur installé pendant que l'app tourne apparaît au prochain lancement.
  const editors = ref<EditorApp[] | null>(null)
  const finderIcon = ref<string | null>(null)
  // Chaque icône du Finder le demande au montage : un seul chargement, partagé.
  let editorsLoad: Promise<EditorApp[]> | null = null
  function loadEditors() {
    editorsLoad ??= Promise.all([filesEditors().catch(() => []), filesFinderIcon().catch(() => null)]).then(([apps, icon]) => {
      editors.value = apps
      finderIcon.value = icon
      return apps
    })
    return editorsLoad
  }

  return { of, editing, openFile, pin, closeFile, moved, view, setView, explorerWidth, setExplorerWidth, explorerShown, wantsFocus, requestFocus, clipboard, editors, finderIcon, loadEditors }
})
