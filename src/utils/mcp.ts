import type { McpServer } from '@/ipc/bindings/McpServer'

// Un serveur éteint n'est pas lancé : son état réel ne compte plus.
export function mcpStatus(server: McpServer, on: boolean, t: (key: string, values?: unknown) => string) {
  if (server.status === 'disabled') return { tone: 'bg-muted/50', text: t('settings.skills.status.disabled') }
  if (!on) return { tone: 'bg-muted/50', text: t('settings.skills.status.off') }
  switch (server.status) {
    case 'connected':
      return { tone: 'bg-success', text: server.tools === null ? t('settings.skills.status.connected') : t('settings.skills.tools', server.tools) }
    case 'pending':
      return { tone: 'bg-warning animate-pulse motion-reduce:animate-none', text: t('settings.skills.status.pending') }
    case 'needsAuth':
      return { tone: 'bg-info', text: t('settings.skills.status.needsAuth') }
    default:
      return { tone: 'bg-danger', text: t('settings.skills.status.failed', { error: server.error ?? '' }) }
  }
}

// Logos des services courants (src/assets/mcp), cherchés par nom : « claude.ai Google Drive » donne googledrive.
const logos = import.meta.glob<string>('@/assets/mcp/*.svg', { query: '?raw', import: 'default', eager: true })
const logoByName: Record<string, string> = Object.fromEntries(
  Object.entries(logos).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), svg.replace(/<title>.*?<\/title>/, '')]),
)

export function mcpLogo(name: string) {
  const key = name.replace(/^claude\.ai\s+/i, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return logoByName[key] ?? null
}

// Nom affiché : sans le préfixe « claude.ai » des connecteurs du compte, comme l'app Claude.
export function mcpLabel(name: string) {
  return name.replace(/^claude\.ai\s+/i, '')
}
