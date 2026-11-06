import { Channel, invoke } from '@tauri-apps/api/core'
import type { ServerEvent } from '@/ipc/bindings/ServerEvent'
import type { ServerList } from '@/ipc/bindings/ServerList'
import type { ServerLogs } from '@/ipc/bindings/ServerLogs'
import type { ServerStart } from '@/ipc/bindings/ServerStart'
import type { Place } from '@/stores/conversations'

// Les serveurs de .claude/launch.json là où travaille l'agent du chat.
export function serverList(chatId: string, place: Place) {
  return invoke<ServerList>('server_list', { chatId, ...place })
}

export function serverStart(chatId: string, place: Place, name: string) {
  return invoke<ServerStart>('server_start', { chatId, ...place, name })
}

export function serverStop(root: string, name: string) {
  return invoke<void>('server_stop', { root, name })
}

export function serverStopAll(root: string) {
  return invoke<void>('server_stop_all', { root })
}

// Un seul flux pour tous les serveurs ; rend les logs déjà reçus avant son branchement.
export function serverWatch(onEvent: (event: ServerEvent) => void) {
  return invoke<ServerLogs[]>('server_watch', { onEvent: new Channel<ServerEvent>(onEvent) })
}
