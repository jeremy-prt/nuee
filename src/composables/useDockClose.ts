import { nextTick } from 'vue'
import { useDockFocus } from '@/composables/useDockFocus'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import { useBrowserStore } from '@/stores/browser'
import { useFilesStore } from '@/stores/files'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'

export interface DockTab {
  view: DockView
  page?: BrowserTab | null
  // Groupe de shells d'un onglet du terminal.
  group?: string | null
}

// WebKit ne donne pas le focus à un bouton cliqué : après un clic dans le panneau, ⌘W arrive sur `body`. On retient
// donc le dernier endroit cliqué, oublié dès que le focus ou un clic part ailleurs.
let clicked: Element | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => (clicked = event.target instanceof Element ? event.target : null), true)
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && !event.target.closest('[data-right-dock]')) clicked = null
  })
}

// Fermeture d'un onglet du panneau de droite, depuis sa barre ou par ⌘W quand le focus est dans le panneau.
export function useDockClose() {
  const layout = useLayoutStore()
  const browser = useBrowserStore()
  const terminals = useTerminalsStore()
  const files = useFilesStore()
  const dockFocus = useDockFocus()
  const { chat } = useTerminalChat()

  // Fermer la dernière page ou le dernier shell ferme aussi le volet.
  async function close(item: DockTab) {
    const chatId = chat.value?.id
    if (item.page && chatId) {
      const last = browser.tabsOf(chatId).length <= 1
      browser.close(item.page.id)
      if (last) layout.closeView('browser')
    } else if (item.group && chatId) {
      const shells = terminals.tabsOf(chatId).filter((shell) => shell.group === item.group)
      for (const shell of shells) await terminals.close(chatId, shell.key)
      if (!terminals.tabsOf(chatId).length) layout.closeView('terminal')
    } else {
      layout.closeView(item.view)
    }
  }

  function shownTab(view: DockView): DockTab {
    const chatId = chat.value?.id
    if (!chatId) return { view }
    if (view === 'browser') return { view, page: browser.activeOf(chatId) }
    const shell = view === 'terminal' ? terminals.tabsOf(chatId).find((item) => item.key === terminals.active[chatId]) : null
    return { view, group: shell?.group ?? null }
  }

  // ⌘W : xterm et l'éditeur laissent passer les raccourcis globaux, qui fermeraient toute la session. Faux si la cible
  // n'est pas dans le panneau. L'élément fermé emporte le focus : il passe au volet qui reste, sinon au champ de saisie.
  function closeFrom(target: EventTarget | null) {
    if (target === document.body && clicked?.isConnected && clicked.closest('[data-right-dock]')) target = clicked
    if (!(target instanceof Element) || !target.closest('[data-right-dock]')) return false
    const view = target.closest<HTMLElement>('[data-dock-view]')?.dataset.dockView as DockView | undefined
    // Lanceur seul : rien à fermer d'autre que le panneau.
    if (!view) {
      if (layout.right.open) layout.toggleRight()
      dockFocus.focusComposer()
      return true
    }
    // Explorateur avec un fichier ouvert : ⌘W ferme le fichier, le volet reste (comme un éditeur).
    const chatId = chat.value?.id
    const file = view === 'files' && chatId ? files.of(chatId).open : null
    if (file && chatId) {
      files.closeFile(chatId, file)
      return true
    }
    close(shownTab(view)).then(() =>
      nextTick(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        const next = layout.isShown(view) ? view : layout.right.active
        if (layout.right.open && next) dockFocus.focusView(next)
        else dockFocus.focusComposer()
      }),
    )
    return true
  }

  return { close, closeFrom }
}
