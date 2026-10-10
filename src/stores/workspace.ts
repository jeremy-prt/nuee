import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Attachment } from '@/ipc/bindings/Attachment'
import { chatList, chatTitle } from '@/ipc/chat'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'

export interface Tab {
  id: string
  kind: 'chat'
  number: number
  projectId: string | null
  agent: AgentKind
  // null jusqu'au premier message : on affiche alors « Chat <number> ».
  title: string | null
  // Un chat n'entre dans l'historique qu'une fois son premier message envoyé.
  started: boolean
}

interface PaneLayout {
  // Onglets ouverts dans la barre de titre. Fermer un onglet garde le chat dans l'historique.
  tabs: string[]
  // Onglet affiché dans chaque pane, de gauche à droite.
  panes: string[]
  focused: number
}

const MAX_PANES = 2
const SEED_LENGTH = 50

// Titre affiché tout de suite, le temps que l'agent en propose un meilleur.
function titleSeed(prompt: string, attachments: Attachment[]) {
  const line = prompt.split('\n').find((text) => text.trim())?.trim() ?? attachments.map((attachment) => attachment.name).join(', ')
  return line.length > SEED_LENGTH ? `${line.slice(0, SEED_LENGTH - 1).trimEnd()}…` : line
}
const STORAGE_KEY = 'nuee.workspace.v1'

function loadLayouts(): Record<string, Partial<PaneLayout>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// Chaque contexte (un projet, ou les chats sans projet) a ses onglets et sa disposition.
export const useWorkspaceStore = defineStore('workspace', () => {
  const navigation = useNavigationStore()
  const conversations = useConversationsStore()
  // Tous les chats enregistrés, ouverts ou non.
  const tabs = ref<Tab[]>([])
  const layouts = reactive<Record<string, PaneLayout>>({})

  // La disposition enregistrée ne reprend que des chats qui existent encore.
  chatList()
    .then((chats) => {
      const known = new Set(chats.map((chat) => chat.id))
      tabs.value = [...chats.map((chat) => ({ ...chat, kind: 'chat' as const })), ...tabs.value.filter((tab) => !known.has(tab.id))]
      for (const [key, saved] of Object.entries(loadLayouts())) {
        if (layouts[key] || !Array.isArray(saved.tabs) || !Array.isArray(saved.panes)) continue
        const open = saved.tabs.filter((id) => known.has(id))
        const panes = saved.panes.filter((id) => open.includes(id))
        layouts[key] = { tabs: open, panes, focused: Math.min(saved.focused ?? 0, Math.max(0, panes.length - 1)) }
      }
    })
    .catch((error) => console.error('historique', error))
    .finally(() => {
      watch(
        layouts,
        (value) => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
          } catch {
            // Stockage indisponible : la disposition reste valable pour la session.
          }
        },
        { deep: true, immediate: true },
      )
    })

  const contextKey = computed(() => navigation.projectId ?? '')

  function layoutOf(key: string) {
    layouts[key] ??= { tabs: [], panes: [], focused: 0 }
    return layouts[key] as PaneLayout
  }

  function current() {
    return layoutOf(contextKey.value)
  }

  const panes = computed(() => layouts[contextKey.value]?.panes ?? [])
  const focusedPane = computed({
    get: () => layouts[contextKey.value]?.focused ?? 0,
    set: (index: number) => {
      current().focused = index
    },
  })
  const activeTabId = computed(() => panes.value[focusedPane.value] ?? null)
  const contextTabs = computed(() =>
    (layouts[contextKey.value]?.tabs ?? []).flatMap((id) => tabs.value.find((tab) => tab.id === id) ?? []),
  )
  const startedChats = computed(() => tabs.value.filter((tab) => tab.started))
  // Historique de la barre latérale, le plus récent en haut.
  const contextChats = computed(() => tabsFor(navigation.projectId).filter((tab) => tab.started).reverse())

  function tabsFor(projectId: string | null) {
    return tabs.value.filter((tab) => tab.projectId === projectId)
  }

  // Premier numéro libre du contexte : supprimer « Chat 2 » puis en créer un autre redonne « Chat 2 ».
  function nextChatNumber(projectId: string | null) {
    const used = new Set(tabsFor(projectId).map((tab) => tab.number))
    let number = 1
    while (used.has(number)) number++
    return number
  }

  function createChat() {
    const projectId = navigation.projectId
    const tab: Tab = { id: crypto.randomUUID(), kind: 'chat', number: nextChatNumber(projectId), projectId, agent: 'claude', title: null, started: false }
    tabs.value.push(tab)
    conversations.create({ id: tab.id, projectId, number: tab.number, agent: tab.agent, title: null, started: false })
    current().tabs.push(tab.id)
    return tab
  }

  function show(id: string) {
    const layout = current()
    if (!layout.tabs.includes(id)) layout.tabs.push(id)
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

  function closePane(index: number, layout = current()) {
    layout.panes.splice(index, 1)
    layout.focused = Math.max(0, Math.min(layout.focused, layout.panes.length - 1))
  }

  function closeTab(id: string, layout = current()) {
    const index = layout.tabs.indexOf(id)
    if (index === -1) return
    layout.tabs.splice(index, 1)
    // Fermé sans message, il ne serait plus visible nulle part : on ne le garde pas.
    if (tabs.value.some((tab) => tab.id === id && !tab.started)) deleteChat(id)

    const paneIndex = layout.panes.indexOf(id)
    if (paneIndex === -1) return
    const remaining = layout.tabs
    const neighbours = [remaining[index], remaining[index - 1], ...remaining]
    const replacement = neighbours.find((tabId) => tabId && !layout.panes.includes(tabId))
    if (replacement) layout.panes[paneIndex] = replacement
    else closePane(paneIndex, layout)
  }

  function closeActiveTab() {
    if (activeTabId.value) closeTab(activeTabId.value)
  }

  function deleteChat(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab) return
    const layout = layouts[tab.projectId ?? '']
    if (layout) closeTab(id, layout)
    tabs.value = tabs.value.filter((item) => item.id !== id)
    conversations.remove(id)
  }

  // Premier message du chat : il entre dans l'historique, et l'agent résume le message en titre
  // (quelques secondes) ; le début du message sert de titre en attendant.
  function startChat(id: string, prompt: string, attachments: Attachment[]) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab) return
    tab.started = true
    if (tab.title !== null) return
    const seed = titleSeed(prompt, attachments)
    if (!seed) return
    tab.title = seed
    chatTitle(id, tab.agent, prompt, seed)
      .then((title) => {
        const current = tabs.value.find((item) => item.id === id)
        if (current) current.title = title
      })
      .catch((error) => console.error('titre', error))
  }

  // Réordonne les onglets ouverts en plaçant `id` juste avant `beforeId` (ou en fin de liste).
  function moveTab(id: string, beforeId: string | null) {
    const layout = current()
    if (!layout.tabs.includes(id) || beforeId === id) return
    const rest = layout.tabs.filter((tabId) => tabId !== id)
    const target = beforeId ? rest.indexOf(beforeId) : -1
    rest.splice(target === -1 ? rest.length : target, 0, id)
    if (rest.some((tabId, i) => tabId !== layout.tabs[i])) layout.tabs = rest
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
    contextChats,
    startedChats,
    show,
    openChat,
    split,
    closePane,
    closeTab,
    closeActiveTab,
    deleteChat,
    startChat,
    moveTab,
    dropTab,
  }
})
