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

function logoKey(name: string) {
  return name.replace(/^claude\.ai\s+/i, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function mcpLogo(name: string) {
  return logoByName[logoKey(name)] ?? null
}

// Couleur de marque des logos (valeurs de Simple Icons). Les marques noires ou très sombres (Notion, GitHub, Vercel…)
// gardent la couleur du texte : elles disparaîtraient sur le fond sombre.
const brandColors: Record<string, string> = {
  airtable: '#18BFFF',
  asana: '#F06A6A',
  atlassian: '#0052CC',
  box: '#0061D5',
  clickup: '#7B68EE',
  cloudflare: '#F38020',
  discord: '#5865F2',
  dropbox: '#0061FF',
  figma: '#F24E1E',
  gmail: '#EA4335',
  googlecalendar: '#4285F4',
  googledrive: '#4285F4',
  hubspot: '#FF7A59',
  intercom: '#1F8DED',
  jira: '#0052CC',
  linear: '#5E6AD2',
  stripe: '#635BFF',
  supabase: '#3FCF8E',
  todoist: '#E44332',
  trello: '#0052CC',
  zapier: '#FF4F00',
}

export function mcpLogoColor(name: string) {
  return brandColors[logoKey(name)] ?? null
}

// Nom affiché : sans le préfixe « claude.ai » des connecteurs du compte, comme l'app Claude.
export function mcpLabel(name: string) {
  return name.replace(/^claude\.ai\s+/i, '')
}
