import { nextTick } from 'vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useBrowserStore } from '@/stores/browser'
import { useFilesStore } from '@/stores/files'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'
import { useWorkspaceStore } from '@/stores/workspace'

// Raccourcis du panneau de droite (exception à la règle de focus) : un volet affiché par son raccourci prend le focus,
// une fermeture le rend au champ de saisie de la session.
export function useDockFocus() {
  const layout = useLayoutStore()
  const terminals = useTerminalsStore()
  const browser = useBrowserStore()
  const files = useFilesStore()
  const workspace = useWorkspaceStore()
  const { chat } = useTerminalChat()

  function focusComposer() {
    files.wantsFocus = false
    nextTick(() => document.querySelector<HTMLElement>(`[data-pane-index="${workspace.focusedPane}"] .prompt-field`)?.focus())
  }

  // Le volet vient peut-être d'être monté : la barre d'adresse n'écoute `focusAddress` qu'une fois rendue.
  function focusView(view: DockView) {
    if (view === 'terminal') terminals.requestFocus()
    else if (view === 'files') files.requestFocus()
    else if (view === 'browser') {
      const page = chat.value ? browser.activeOf(chat.value.id) : null
      if (!page || page.url === 'about:blank') nextTick(() => browser.focusAddress++)
    }
  }

  function toggleView(view: DockView) {
    layout.toggleView(view)
    if (layout.isShown(view)) focusView(view)
    else focusComposer()
  }

  // Le bouton ne déplace le focus que s'il était dans le panneau, qui disparaît ; le raccourci, toujours.
  function toggleDock(fromShortcut = true) {
    const inside = !!document.activeElement?.closest('[data-right-dock]')
    layout.toggleRight()
    if (!layout.right.open && (fromShortcut || inside)) focusComposer()
  }

  return { focusComposer, focusView, toggleView, toggleDock }
}
