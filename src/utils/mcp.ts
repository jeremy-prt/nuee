import type { McpServer } from '@/ipc/bindings/McpServer'

// Un serveur éteint n'est pas lancé : son état réel ne compte plus. `dot` pour la pastille, `color` pour le texte
// (seulement ce qui demande un geste).
export function mcpStatus(server: McpServer, on: boolean, t: (key: string, values?: unknown) => string) {
  if (server.status === 'disabled') return { dot: 'bg-muted/50', color: '', text: t('settings.skills.status.disabled') }
  if (!on) return { dot: 'bg-muted/50', color: '', text: t('settings.skills.status.off') }
  switch (server.status) {
    case 'connected':
      return { dot: 'bg-success', color: '', text: server.tools === null ? t('settings.skills.status.connected') : t('settings.skills.tools', server.tools) }
    case 'pending':
      return { dot: 'bg-warning animate-pulse motion-reduce:animate-none', color: '', text: t('settings.skills.status.pending') }
    case 'needsAuth':
      return { dot: 'bg-warning', color: 'text-warning', text: t('settings.skills.status.needsAuth') }
    default:
      return { dot: 'bg-danger', color: 'text-danger', text: t('settings.skills.status.failed', { error: server.error ?? '' }) }
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
