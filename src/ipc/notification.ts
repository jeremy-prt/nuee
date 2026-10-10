import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { NotificationPermission } from '@/ipc/bindings/NotificationPermission'

// macOS demande l'autorisation au premier envoi. Sans effet sous `tauri dev` : il faut l'app empaquetée.
export function notificationSend(chatId: string, title: string, body: string) {
  return invoke<void>('notification_send', { chatId, title, body })
}

export function notificationWithdraw(chatId: string) {
  return invoke<void>('notification_withdraw', { chatId })
}

// Pastille du Dock (macOS) ; 0 la retire.
export function notificationBadge(count: number) {
  return invoke<void>('notification_badge', { count })
}

export function onNotificationClicked(handler: (chatId: string) => void) {
  return listen<string>('notification-clicked', (event) => handler(event.payload))
}

export function notificationPermission() {
  return invoke<NotificationPermission>('notification_permission')
}

export function notificationOpenSettings() {
  return invoke<void>('notification_open_settings')
}
