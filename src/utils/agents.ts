import type { AgentKind } from '@/ipc/bindings/AgentKind'

// Noms de produit (non traduits) et commande à taper dans un terminal pour l'installer ou s'y connecter.
export const agents: Record<AgentKind, { name: string; command: string }> = {
  claude: { name: 'Claude Code', command: 'claude' },
}

// Montrés dans Réglages > Agents pour annoncer la suite, pas encore pilotables.
export const upcomingAgents = [
  { id: 'codex', name: 'Codex' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'antigravity', name: 'Antigravity' },
  { id: 'grok', name: 'Grok' },
] as const
