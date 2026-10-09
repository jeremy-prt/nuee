import type { AgentKind } from '@/ipc/bindings/AgentKind'

// Noms de produit (non traduits) et commande à taper dans un terminal pour l'installer ou s'y connecter.
export const agents: Record<AgentKind, { name: string; command: string }> = {
  claude: { name: 'Claude Code', command: 'claude' },
}
