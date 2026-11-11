import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { type EditorTabs, closeTab, openTab, pinTab } from '@/utils/editorTabs'

// Diff ouvert à gauche de la liste du volet Git : un fichier non commité, ou un fichier d'un commit de l'historique.
export type DiffTab = { key: string; path: string } & ({ kind: 'work' } | { kind: 'commit'; sha: string; short: string })

interface GitView extends EditorTabs<DiffTab> {
  // Message du commit direct, gardé quand le volet est recréé (changement d'onglet ou de volet).
  message: string
}

export const workKey = (path: string) => `work:${path}`
export const commitKey = (sha: string, path: string) => `commit:${sha}:${path}`
const keyOf = (tab: DiffTab) => tab.key

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
    openTab(of(chatId), tab, keyOf, pin)
  }

  function pin(chatId: string, key: string) {
    pinTab(of(chatId), key)
  }

  function closeDiff(chatId: string, key: string) {
    closeTab(of(chatId), key, keyOf)
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

  return { of, openDiff, pin, closeDiff, keepWork, setMessage, forget }
})
