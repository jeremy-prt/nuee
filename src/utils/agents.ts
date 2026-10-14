import type { AgentKind } from '@/ipc/bindings/AgentKind'

// Noms de produit (non traduits), commande à taper dans un terminal pour l'installer ou s'y connecter, et couleur
// de l'animation qui dit que l'agent travaille (celle de sa CLI).
export const agents: Record<AgentKind, { name: string; command: string; color: string }> = {
  claude: { name: 'Claude Code', command: 'claude', color: '#D77757' },
}

// Agent d'un nouveau chat quand son projet n'en choisit pas d'autre.
export const defaultAgent: AgentKind = 'claude'

// Montrés dans Réglages > Agents pour annoncer la suite, pas encore pilotables.
export const upcomingAgents = [
  { id: 'codex', name: 'Codex' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'antigravity', name: 'Antigravity' },
  { id: 'grok', name: 'Grok' },
] as const
