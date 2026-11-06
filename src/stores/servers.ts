import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import type { ServerList } from '@/ipc/bindings/ServerList'
import { serverList, serverStart, serverStop, serverStopAll, serverWatch } from '@/ipc/server'
import type { Place } from '@/stores/conversations'
import { useToastsStore } from '@/stores/toasts'

// `reset` : le serveur repart de zéro, ses anciens logs sont effacés.
type LogListener = (data: string, reset: boolean) => void

const key = (root: string, name: string) => `${root}\n${name}`

// Serveurs de .claude/launch.json, rangés par dossier de session : deux sessions du même dossier voient les mêmes.
export const useServersStore = defineStore('servers', () => {
  const lists = reactive<Record<string, ServerList>>({})
  const rootOf = reactive<Record<string, string>>({})
  // Serveur dont le volet Navigateur montre les logs.
  const viewing = ref<{ root: string; name: string } | null>(null)
  // Hors réactivité : du texte qui grossit à chaque ligne, lu par le seul volet des logs.
  const logs = new Map<string, string>()
  const listeners = new Map<string, Set<LogListener>>()

  serverWatch((event) => {
    if (event.type === 'output') {
      const id = key(event.root, event.name)
      logs.set(id, (logs.get(id) ?? '') + event.data)
      for (const listener of listeners.get(id) ?? []) listener(event.data, false)
    } else {
      update(event.root, event.server)
    }
  })
    .then((backlog) => {
      for (const { root, name, data } of backlog) {
        const id = key(root, name)
        logs.set(id, data)
        for (const listener of listeners.get(id) ?? []) listener(data, true)
      }
    })
    .catch(() => {})

  function update(root: string, server: ServerInfo) {
    const list = lists[root]
    const index = list?.servers.findIndex((item) => item.name === server.name) ?? -1
    const before = index === -1 ? null : list!.servers[index]!
    if (server.status === 'starting' && before?.status !== 'starting') {
      const id = key(root, server.name)
      logs.set(id, '')
      for (const listener of listeners.get(id) ?? []) listener('', true)
    }
    if (list) {
      if (index === -1) list.servers.push(server)
      else list.servers[index] = server
    }
    if (server.status === 'exited' && before?.status !== 'exited') {
      const { t } = i18nGlobal()
      useToastsStore().push({
        kind: 'error',
        title: t('dock.servers.exited', { name: server.name }),
        body: server.exitCode === null ? '' : t('dock.servers.exitCode', { code: server.exitCode }),
        action: { label: t('dock.servers.logs'), run: () => show(root, server.name) },
      })
    }
  }

  async function refresh(chatId: string, place: Place) {
    const list = await serverList(chatId, place)
    lists[list.root] = list
    rootOf[chatId] = list.root
    return list
  }

  function listOf(chatId: string) {
    const root = rootOf[chatId]
    return root ? (lists[root] ?? null) : null
  }

  async function start(chatId: string, place: Place, name: string) {
    const { t } = i18nGlobal()
    const toasts = useToastsStore()
    try {
      const result = await serverStart(chatId, place, name)
      if (result.type === 'portTaken') {
        toasts.push({ kind: 'error', title: t('dock.servers.portTaken', { port: result.port }), body: t('dock.servers.portTakenHelp') })
      } else if (result.type === 'commandNotFound') {
        toasts.push({ kind: 'error', title: t('dock.servers.notFound', { command: result.command }), body: t('dock.servers.notFoundHelp') })
      } else {
        const root = rootOf[chatId]
        if (root) update(root, result.server)
        const { port, activePort } = result.server
        if (activePort !== null && activePort !== port) {
          toasts.push({ kind: 'info', title: t('dock.servers.moved', { name, port: activePort }), body: t('dock.servers.movedHelp', { port }) })
        }
        if (root) show(root, name)
      }
    } catch (error) {
      const message = (error as { message?: string })?.message ?? String(error)
      toasts.push({ kind: 'error', title: t('dock.servers.failed', { name }), body: message })
    }
  }

  function stop(root: string, name: string) {
    serverStop(root, name).catch(() => {})
  }

  function stopAll(root: string) {
    serverStopAll(root).catch(() => {})
  }

  function show(root: string, name: string) {
    viewing.value = { root, name }
  }

  function hide() {
    viewing.value = null
  }

  function textOf(root: string, name: string) {
    return logs.get(key(root, name)) ?? ''
  }

  function listen(root: string, name: string, listener: LogListener) {
    const id = key(root, name)
    let set = listeners.get(id)
    if (!set) listeners.set(id, (set = new Set()))
    set.add(listener)
    return () => set.delete(listener)
  }

  return { lists, viewing, refresh, listOf, start, stop, stopAll, show, hide, textOf, listen }
})
