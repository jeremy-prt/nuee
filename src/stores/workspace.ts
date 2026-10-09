import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'

export interface Tab {
  id: string
  kind: 'chat'
  number: number
  projectId: string | null
}

interface PaneLayout {
  // Onglet affiché dans chaque pane, de gauche à droite.
  panes: string[]
  focused: number
}

const MAX_PANES = 2

// Chaque contexte (un projet, ou les chats sans projet) a ses onglets et sa disposition.
export const useWorkspaceStore = defineStore('workspace', () => {
  const navigation = useNavigationStore()
  const conversations = useConversationsStore()
  const tabs = ref<Tab[]>([])
  const layouts = reactive<Record<string, PaneLayout>>({})

  const contextKey = computed(() => navigation.projectId ?? '')

  function current() {
    layouts[contextKey.value] ??= { panes: [], focused: 0 }
    return layouts[contextKey.value] as PaneLayout
  }

  const panes = computed(() => layouts[contextKey.value]?.panes ?? [])
  const focusedPane = computed({
    get: () => layouts[contextKey.value]?.focused ?? 0,
    set: (index: number) => {
      current().focused = index
    },
  })
  const activeTabId = computed(() => panes.value[focusedPane.value] ?? null)
  const contextTabs = computed(() => tabsFor(navigation.projectId))

  function tabsFor(projectId: string | null) {
    return tabs.value.filter((tab) => tab.projectId === projectId)
  }

  // Premier numéro libre du contexte : fermer « Chat 2 » puis en ouvrir un autre redonne « Chat 2 ».
  function nextChatNumber(projectId: string | null) {
    const used = new Set(tabsFor(projectId).map((tab) => tab.number))
    let number = 1
    while (used.has(number)) number++
    return number
  }

  function createChat() {
    const projectId = navigation.projectId
    const tab: Tab = { id: crypto.randomUUID(), kind: 'chat', number: nextChatNumber(projectId), projectId }
    tabs.value.push(tab)
    return tab
  }

  function show(id: string) {
    const layout = current()
    const index = layout.panes.indexOf(id)
    if (index !== -1) {
      layout.focused = index
    } else if (!layout.panes.length) {
      layout.panes = [id]
      layout.focused = 0
    } else {
      layout.panes[layout.focused] = id
    }
  }

  function openChat() {
    show(createChat().id)
  }

  function split() {
    const layout = current()
    if (layout.panes.length >= MAX_PANES) return
    layout.panes.push(createChat().id)
    layout.focused = layout.panes.length - 1
  }

  function closePane(index: number) {
    const layout = current()
    layout.panes.splice(index, 1)
    layout.focused = Math.max(0, Math.min(layout.focused, layout.panes.length - 1))
  }

  function closeTab(id: string) {
    const siblings = contextTabs.value
    const index = siblings.findIndex((tab) => tab.id === id)
    if (index === -1) return
    tabs.value = tabs.value.filter((tab) => tab.id !== id)
    conversations.dispose(id)

    const layout = current()
    const paneIndex = layout.panes.indexOf(id)
    if (paneIndex === -1) return
    const remaining = siblings.filter((tab) => tab.id !== id)
    const neighbours = [remaining[index], remaining[index - 1], ...remaining]
    const replacement = neighbours.find((tab) => tab && !layout.panes.includes(tab.id))
    if (replacement) layout.panes[paneIndex] = replacement.id
    else closePane(paneIndex)
  }

  function closeActiveTab() {
    if (activeTabId.value) closeTab(activeTabId.value)
  }

  // Réordonne en plaçant l'onglet juste avant `beforeId` (ou en fin de liste).
  function moveTab(id: string, beforeId: string | null) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab || beforeId === id) return
    const rest = tabs.value.filter((item) => item.id !== id)
    const target = beforeId ? rest.findIndex((item) => item.id === beforeId) : -1
    rest.splice(target === -1 ? rest.length : target, 0, tab)
    if (rest.some((item, i) => item.id !== tabs.value[i]?.id)) tabs.value = rest
  }

  // Dépôt d'un onglet glissé sur un pane : au centre il s'y affiche, sur un côté il ouvre le second pane.
  function dropTab(id: string, paneIndex: number, side: 'left' | 'right' | 'center') {
    const layout = current()
    if (side === 'center') {
      const existing = layout.panes.indexOf(id)
      if (existing !== -1) layout.panes[existing] = layout.panes[paneIndex] ?? id
      layout.panes[paneIndex] = id
      layout.focused = paneIndex
      return
    }
    if (layout.panes.length >= MAX_PANES) return
    const kept = layout.panes[0] === id ? contextTabs.value.find((tab) => tab.id !== id)?.id : layout.panes[0]
    if (!kept) return
    layout.panes = side === 'right' ? [kept, id] : [id, kept]
    layout.focused = side === 'right' ? 1 : 0
  }

  return {
    tabs,
    panes,
    focusedPane,
    activeTabId,
    contextTabs,
    show,
    openChat,
    split,
    closePane,
    closeTab,
    closeActiveTab,
    moveTab,
    dropTab,
  }
})
