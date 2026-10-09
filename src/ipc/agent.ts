import { Channel, invoke } from '@tauri-apps/api/core'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AppError } from '@/ipc/bindings/AppError'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { SessionSpec } from '@/ipc/bindings/SessionSpec'

// Se résout dès que le message est parti ; les événements arrivent ensuite sur onEvent, jusqu'à turnEnd.
// recap : réponse coupée au tour précédent, rappelée à l'agent seulement si son process est neuf.
export function agentSend(spec: SessionSpec, prompt: string, recap: string | null, onEvent: (event: AgentEvent) => void) {
  const channel = new Channel<AgentEvent>(onEvent)
  return invoke<void>('agent_send', { spec, prompt, recap, onEvent: channel })
}

// Démarre le process du chat pendant que l'utilisateur écrit : le premier message part sans attendre.
export function agentWarm(spec: SessionSpec) {
  return invoke<void>('agent_warm', { spec })
}

export function agentStop(chatId: string) {
  return invoke<void>('agent_stop', { chatId })
}

// Réponse à une demande d'autorisation du mode Auto ; l'agent attend pour continuer.
export function agentApprove(chatId: string, requestId: string, allow: boolean) {
  return invoke<void>('agent_approve', { chatId, requestId, allow })
}

// Modèles de l'agent installé ; Rust le lit une fois par lancement de l'app.
export function agentCatalog(agent: AgentKind) {
  return invoke<Catalog>('agent_catalog', { agent })
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
}
