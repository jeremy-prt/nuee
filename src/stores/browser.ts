import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import type { ColorScheme } from '@/ipc/bindings/ColorScheme'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import type { Viewport } from '@/ipc/bindings/Viewport'
import {
  browserClearData,
  browserClose,
  browserCloseChat,
  browserEmulate,
  browserHistory,
  browserNavigate,
  browserOpen,
  browserSelect,
  browserWatch,
} from '@/ipc/browser'
import { isTauriApp } from '@/ipc/system'
import type { Place } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useServersStore } from '@/stores/servers'
import { useToastsStore } from '@/stores/toasts'
import { useWorkspaceStore } from '@/stores/workspace'

// Le libellé de l'agent reste un moment après son action : sinon il clignote d'un outil à l'autre.
const AGENT_LINGER = 3000
const SERVER_TIMEOUT = 60_000

// Onglets du volet Navigateur, rangés par session. Les pages vivent côté Rust (une WKWebView chacune).
export const useBrowserStore = defineStore('browser', () => {
  const tabs = reactive<Record<string, BrowserTab>>({})
  const order = ref<string[]>([])
  // Onglet au premier plan de chaque session.
  const active = reactive<Record<string, string>>({})
  // Ce que fait l'agent dans chaque onglet, pour le bandeau du volet.
  const agent = reactive<Record<string, string>>({})
  const agentTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Champ d'adresse à sélectionner (⌘L, onglet neuf).
  const focusAddress = ref(0)

  function upsert(tab: BrowserTab) {
    if (!tabs[tab.id]) order.value.push(tab.id)
    tabs[tab.id] = tab
    if (!active[tab.chatId]) active[tab.chatId] = tab.id
  }

  function remove(id: string) {
    const tab = tabs[id]
    if (!tab) return
    const siblings = tabsOf(tab.chatId)
    const index = siblings.findIndex((item) => item.id === id)
    delete tabs[id]
    order.value = order.value.filter((item) => item !== id)
    delete agent[id]
    if (active[tab.chatId] === id) {
      const next = siblings[index + 1] ?? siblings[index - 1]
      if (next && next.id !== id) select(tab.chatId, next.id)
      else delete active[tab.chatId]
    }
  }

  if (isTauriApp()) {
    browserWatch((event) => {
      if (event.type === 'tab') upsert(event.tab)
      else if (event.type === 'closed') remove(event.id)
      else if (event.type === 'reveal') reveal(event.chatId, event.tabId)
      else if (event.type === 'agent') showAgent(event.tabId, event.action)
      else replayKey(event)
    })
      .then((list) => list.forEach(upsert))
      .catch(() => {})
  }

  function tabsOf(chatId: string) {
    return order.value.map((id) => tabs[id]!).filter((tab) => tab?.chatId === chatId)
  }

  function activeOf(chatId: string) {
    const id = active[chatId]
    return id ? (tabs[id] ?? null) : null
  }

  function projectOf(chatId: string) {
    const tab = useWorkspaceStore().tabs.find((item) => item.id === chatId)
    return useProjectsStore().byId(tab?.projectId ?? null)?.path ?? null
  }

  async function open(chatId: string, url: string) {
    try {
      const tab = await browserOpen(chatId, projectOf(chatId), url)
      upsert(tab)
      select(chatId, tab.id)
      return tab
    } catch (error) {
      failed(error)
      return null
    }
  }

  function select(chatId: string, id: string) {
    active[chatId] = id
    browserSelect(chatId, id).catch(() => {})
  }

  function close(id: string) {
    remove(id)
    browserClose(id).catch(() => {})
  }

  function closeChat(chatId: string) {
    for (const tab of tabsOf(chatId)) remove(tab.id)
    browserCloseChat(chatId).catch(() => {})
  }

  function navigate(id: string, url: string) {
    browserNavigate(id, url).catch(failed)
  }

  function history(id: string, step: 'back' | 'forward' | 'reload' | 'stop') {
    browserHistory(id, step).catch(() => {})
  }

  function emulate(id: string, viewport: Viewport | null, scheme: ColorScheme | null) {
    browserEmulate(id, viewport, scheme).catch(failed)
  }

  async function clearData(chatId: string) {
    const { t } = i18nGlobal()
    try {
      await browserClearData(chatId, projectOf(chatId))
      useToastsStore().push({ kind: 'success', title: t('dock.browser.cleared'), body: '' })
    } catch (error) {
      failed(error)
    }
  }

  // Onglet choisi par l'agent : il entre dans les onglets du panneau sans l'ouvrir ni passer devant, comme T3 Code.
  // Une pastille sur l'onglet (et sur le bouton du panneau fermé) dit que l'agent agit ; on regarde si on veut.
  function reveal(chatId: string, tabId: string) {
    active[chatId] = tabId
    const layout = useLayoutStore()
    if (useWorkspaceStore().activeTabId === chatId) layout.addTab('browser')
    else layout.addView(chatId, 'browser')
  }

  // L'agent agit dans une page de cette session.
  function agentActs(chatId: string) {
    return tabsOf(chatId).some((tab) => !!agent[tab.id])
  }

  function showAgent(tabId: string, action: string | null) {
    clearTimeout(agentTimers.get(tabId))
    if (action) {
      agent[tabId] = action
      return
    }
    agentTimers.set(
      tabId,
      setTimeout(() => delete agent[tabId], AGENT_LINGER),
    )
  }

  // Raccourci tapé dans la page : rejoué sur la fenêtre de Nuée, dont les écouteurs le traitent comme d'habitude.
  function replayKey(event: { key: string; code: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }) {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        metaKey: event.meta,
        ctrlKey: event.ctrl,
        altKey: event.alt,
        shiftKey: event.shift,
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  // Lien du poste cliqué dans la conversation : il s'ouvre dans le volet de la session à l'écran.
  async function openLink(url: string) {
    const chatId = useWorkspaceStore().activeTabId
    if (!chatId) return
    const existing = tabsOf(chatId).find((tab) => sameServer(tab.url, url))
    if (existing) {
      select(chatId, existing.id)
      navigate(existing.id, url)
    } else {
      await open(chatId, url)
    }
    useLayoutStore().showView('browser')
  }

  // ▶ d'un serveur : le lance, attend que son port réponde, puis ouvre sa page (ou y revient).
  async function openServer(chatId: string, place: Place, server: ServerInfo) {
    const servers = useServersStore()
    const alive = server.status === 'starting' || server.status === 'running'
    if (!alive) {
      const started = await servers.start(chatId, place, server.name, false)
      if (!started) return
    }
    const root = servers.listOf(chatId)?.root
    const ready = await new Promise<ServerInfo | null>((resolve) => {
      const current = () => servers.lists[root ?? '']?.servers.find((item) => item.name === server.name) ?? null
      const timer = setTimeout(() => finish(null), SERVER_TIMEOUT)
      const stop = watch(
        current,
        (info) => {
          if (info?.status === 'running') finish(info)
          else if (info?.status === 'exited' || info?.status === 'stopped') finish(null)
        },
        { immediate: true, deep: true },
      )
      function finish(info: ServerInfo | null) {
        clearTimeout(timer)
        queueMicrotask(() => stop())
        resolve(info)
      }
    })
    if (!ready) return
    const url = ready.url ?? `http://localhost:${ready.activePort ?? ready.port}`
    const existing = tabsOf(chatId).find((tab) => sameServer(tab.url, url))
    if (existing) {
      select(chatId, existing.id)
      if (existing.error) history(existing.id, 'reload')
    } else {
      await open(chatId, url)
    }
    useLayoutStore().showView('browser')
  }

  function failed(error: unknown) {
    const { t } = i18nGlobal()
    const message = (error as { message?: string })?.message ?? String(error)
    useToastsStore().push({ kind: 'error', title: t('dock.browser.failed'), body: message })
  }

  return {
    tabs,
    active,
    agent,
    focusAddress,
    tabsOf,
    activeOf,
    open,
    select,
    close,
    closeChat,
    navigate,
    history,
    emulate,
    clearData,
    openServer,
    openLink,
    agentActs,
  }
})

function sameServer(a: string, b: string) {
  const host = (url: string) => {
    try {
      return new URL(url).host.replace('127.0.0.1', 'localhost')
    } catch {
      return url
    }
  }
  return host(a) === host(b)
}
