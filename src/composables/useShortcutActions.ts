import { computed } from 'vue'
import { useDockClose } from '@/composables/useDockClose'
import { useDockFocus } from '@/composables/useDockFocus'
import { useNewChat } from '@/composables/useNewChat'
import { useAppearanceStore } from '@/stores/appearance'
import { useBrowserStore } from '@/stores/browser'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useSearchStore } from '@/stores/search'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ShortcutId } from '@/utils/shortcuts'

export interface ShortcutAction {
  id: ShortcutId
  run: (event?: KeyboardEvent) => void
  // Sans effet hors des chats : la palette ne la propose pas ailleurs.
  chats?: boolean
}

// Ce que fait chaque raccourci global : App.vue les écoute, la palette de recherche les propose en commandes.
export function useShortcutActions() {
  const layout = useLayoutStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const appearance = useAppearanceStore()
  const browser = useBrowserStore()
  const search = useSearchStore()
  const dockFocus = useDockFocus()
  const dockClose = useDockClose()
  const newTab = useNewChat('tab')

  const inChats = computed(() => navigation.view === 'chats')
  const menu = computed(() => appearance.layout === 'menu')

  // ⌘L : le volet Navigateur s'ouvre au besoin, son adresse est sélectionnée.
  function browserAddress() {
    layout.showView('browser')
    browser.focusAddress++
  }

  function togglePanel() {
    if (navigation.hasPanel && !menu.value) layout.togglePanel()
  }

  // La liste des projets est en haut de la barre latérale : elle s'ouvre au besoin.
  function openSwitcher() {
    if (!menu.value) return
    layout.rail.expanded = true
    if (navigation.view === 'settings') navigation.closeSettings()
    navigation.switcherOpen = true
  }

  // La ligne de la session doit être visible pour s'éditer : le panneau ou la barre latérale s'ouvre au besoin.
  function renameActive() {
    if (menu.value) layout.rail.expanded = true
    else layout.panel.open = true
    workspace.requestRename()
  }

  const actions: ShortcutAction[] = [
    { id: 'search', run: search.toggle },
    { id: 'newChat', run: () => navigation.go('new') },
    { id: 'newTab', run: () => newTab() },
    { id: 'settings', run: () => navigation.go('settings') },
    { id: 'switchProject', run: openSwitcher },
    { id: 'previousProject', run: () => navigation.stepProject(-1) },
    { id: 'nextProject', run: () => navigation.stepProject(1) },
    { id: 'toggleRail', run: layout.toggleRail },
    { id: 'togglePanel', run: togglePanel },
    { id: 'toggleRightDock', run: () => dockFocus.toggleDock(), chats: true },
    { id: 'toggleTerminal', run: () => dockFocus.toggleView('terminal'), chats: true },
    { id: 'toggleBrowser', run: () => dockFocus.toggleView('browser'), chats: true },
    { id: 'toggleExplorer', run: () => dockFocus.toggleView('files'), chats: true },
    { id: 'toggleChanges', run: () => dockFocus.toggleView('changes'), chats: true },
    { id: 'browserAddress', run: browserAddress, chats: true },
    { id: 'closeTab', run: (event) => dockClose.closeFrom(event?.target ?? null) || workspace.closeActiveTab(), chats: true },
    { id: 'closeAllTabs', run: () => workspace.activeTabId && workspace.closeTabs(workspace.activeTabId, 'all'), chats: true },
    { id: 'reopenTab', run: workspace.reopenTab, chats: true },
    { id: 'nextTab', run: () => workspace.stepTab(1), chats: true },
    { id: 'previousTab', run: () => workspace.stepTab(-1), chats: true },
    { id: 'goToTab', run: (event) => event && workspace.goToTab(Number(event.code.slice(-1))), chats: true },
    { id: 'split', run: workspace.split, chats: true },
    { id: 'rename', run: renameActive, chats: true },
    { id: 'zoomIn', run: () => appearance.stepZoom(1) },
    { id: 'zoomOut', run: () => appearance.stepZoom(-1) },
    { id: 'zoomReset', run: appearance.resetZoom },
  ]

  function run(action: ShortcutAction, event?: KeyboardEvent) {
    if (!action.chats || inChats.value) action.run(event)
  }

  return { actions, run, inChats }
}
