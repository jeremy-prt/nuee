import type { McpServer } from '@/ipc/bindings/McpServer'

// Un serveur éteint n'est pas lancé : son état réel ne compte plus.
export function mcpStatus(server: McpServer, on: boolean, t: (key: string, values?: unknown) => string) {
  if (server.status === 'disabled') return { tone: 'bg-muted/50', text: t('settings.skills.status.disabled') }
  if (!on) return { tone: 'bg-muted/50', text: t('settings.skills.status.off') }
  switch (server.status) {
    case 'connected':
      return { tone: 'bg-success', text: server.tools === null ? t('settings.skills.status.connected') : t('settings.skills.tools', server.tools) }
    case 'pending':
      return { tone: 'bg-muted animate-pulse motion-reduce:animate-none', text: t('settings.skills.status.pending') }
    case 'needsAuth':
      return { tone: 'bg-info', text: t('settings.skills.status.needsAuth') }
    default:
      return { tone: 'bg-danger', text: t('settings.skills.status.failed', { error: server.error ?? '' }) }
  }
}
