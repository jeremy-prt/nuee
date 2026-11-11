import { useTerminalChat } from '@/composables/useTerminalChat'
import { useBrowserStore } from '@/stores/browser'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'

// Ouvre un volet depuis le lanceur ou son icône dans la barre. Navigateur ou terminal déjà ouvert reçoit un onglet de plus, comme
// dans T3 Code.
export function useDockOpener() {
  const layout = useLayoutStore()
  const browser = useBrowserStore()
  const terminals = useTerminalsStore()
  const { chat, place } = useTerminalChat()

  return async (view: DockView) => {
    if (view === 'browser' && chat.value && layout.right.tabs.includes('browser') && browser.tabsOf(chat.value.id).length) {
      layout.showView('browser')
      if (await browser.open(chat.value.id, 'about:blank')) browser.focusAddress++
      return
    }
    // Comme le navigateur : un terminal déjà ouvert reçoit un shell de plus.
    if (view === 'terminal' && chat.value && place.value && layout.right.tabs.includes('terminal') && terminals.tabsOf(chat.value.id).length) {
      terminals.create(chat.value.id, place.value)
    }
    layout.showView(view)
    if (view === 'terminal') terminals.requestFocus()
    if (view === 'browser') browser.focusAddress++
  }
}
