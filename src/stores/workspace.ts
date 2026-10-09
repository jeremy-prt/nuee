import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface Tab {
  id: string
  kind: 'chat'
  number: number
}

const MAX_PANES = 2

export const useWorkspaceStore = defineStore('workspace', () => {
  const tabs = ref<Tab[]>([])
  // Onglet affiché dans chaque pane, de gauche à droite.
  const panes = ref<string[]>([])
  const focusedPane = ref(0)
  let chatCount = 0

  const activeTabId = computed(() => panes.value[focusedPane.value] ?? null)

  function createChat() {
    const tab: Tab = { id: crypto.randomUUID(), kind: 'chat', number: ++chatCount }
    tabs.value.push(tab)
    return tab
  }

  function show(id: string) {
    const index = panes.value.indexOf(id)
    if (index !== -1) {
      focusedPane.value = index
    } else if (!panes.value.length) {
      panes.value = [id]
      focusedPane.value = 0
    } else {
      panes.value[focusedPane.value] = id
    }
  }

  function openChat() {
    show(createChat().id)
  }

  function split() {
    if (panes.value.length >= MAX_PANES) return
    panes.value.push(createChat().id)
    focusedPane.value = panes.value.length - 1
  }

  function closePane(index: number) {
    panes.value.splice(index, 1)
    focusedPane.value = Math.max(0, Math.min(focusedPane.value, panes.value.length - 1))
  }

  function closeTab(id: string) {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index === -1) return
    tabs.value.splice(index, 1)

    const paneIndex = panes.value.indexOf(id)
    if (paneIndex === -1) return
    const neighbours = [tabs.value[index], tabs.value[index - 1], ...tabs.value]
    const replacement = neighbours.find((tab) => tab && !panes.value.includes(tab.id))
    if (replacement) panes.value[paneIndex] = replacement.id
    else closePane(paneIndex)
  }

  function closeActiveTab() {
    if (activeTabId.value) closeTab(activeTabId.value)
  }

  return {
    tabs,
    panes,
    focusedPane,
    activeTabId,
    show,
    openChat,
    split,
    closePane,
    closeTab,
    closeActiveTab,
  }
})
