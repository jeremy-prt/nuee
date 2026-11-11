import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

// Diff ouvert à gauche de la liste du volet Git : un fichier non commité, ou un fichier d'un commit de l'historique.
export type DiffTab = { key: string; path: string } & ({ kind: 'work' } | { kind: 'commit'; sha: string; short: string })

interface GitView {
  // Message du commit direct, gardé quand le volet est recréé (changement d'onglet ou de volet).
  message: string
  // Onglets de diff, comme ceux de l'Explorateur : un clic ouvre en aperçu (remplacé au clic suivant), un double clic
  // le garde.
  tabs: DiffTab[]
  open: string | null
  preview: string | null
}

const TREE_KEY = 'nuee.git.tree'

export const workKey = (path: string) => `work:${path}`
export const commitKey = (sha: string, path: string) => `commit:${sha}:${path}`

// Ce que le volet Git montre dans chaque session.
export const useGitPanelStore = defineStore('gitPanel', () => {
  const sessions = reactive(new Map<string, GitView>())

  function of(chatId: string): GitView {
    let view = sessions.get(chatId)
    if (!view) {
      sessions.set(chatId, { message: '', tabs: [], open: null, preview: null })
      view = sessions.get(chatId)!
    }
    return view
  }

  function openDiff(chatId: string, tab: DiffTab, pin = false) {
    const view = of(chatId)
    if (!view.tabs.some((item) => item.key === tab.key)) {
      const preview = view.tabs.findIndex((item) => item.key === view.preview)
      if (!pin && preview >= 0) view.tabs.splice(preview, 1, tab)
      else view.tabs.splice(view.open ? view.tabs.findIndex((item) => item.key === view.open) + 1 : view.tabs.length, 0, tab)
      view.preview = pin ? view.preview : tab.key
    } else if (pin && view.preview === tab.key) view.preview = null
    view.open = tab.key
  }

  function pin(chatId: string, key: string) {
    const view = of(chatId)
    if (view.preview === key) view.preview = null
  }

  function closeDiff(chatId: string, key: string) {
    const view = of(chatId)
    const index = view.tabs.findIndex((item) => item.key === key)
    if (index < 0) return
    view.tabs.splice(index, 1)
    if (view.preview === key) view.preview = null
    if (view.open === key) view.open = view.tabs[Math.min(index, view.tabs.length - 1)]?.key ?? null
  }

  // Fichiers commités ou annulés : leurs onglets de diff n'ont plus rien à montrer.
  function keepWork(chatId: string, paths: ReadonlySet<string>) {
    for (const tab of [...of(chatId).tabs]) if (tab.kind === 'work' && !paths.has(tab.path)) closeDiff(chatId, tab.key)
  }

  function setMessage(chatId: string, message: string) {
    of(chatId).message = message
  }

  function forget(chatId: string) {
    sessions.delete(chatId)
  }

  // Liste en arbre ou à plat, comme monocode : un choix pour toute l'app.
  const tree = ref(read())
  function read() {
    try {
      return localStorage.getItem(TREE_KEY) === 'true'
    } catch {
      return false
    }
  }
  function setTree(value: boolean) {
    tree.value = value
    try {
      localStorage.setItem(TREE_KEY, String(value))
    } catch {
      // Préférence de confort : perdue au redémarrage si le stockage refuse.
    }
  }

  return { of, openDiff, pin, closeDiff, keepWork, setMessage, forget, tree, setTree }
})
