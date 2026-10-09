import { Channel, invoke } from '@tauri-apps/api/core'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AppError } from '@/ipc/bindings/AppError'
import type { TurnRequest } from '@/ipc/bindings/TurnRequest'

// Se résout dès que l'agent est lancé ; ses événements arrivent ensuite sur onEvent, jusqu'à turnEnd.
export function agentSend(request: TurnRequest, onEvent: (event: AgentEvent) => void) {
  const channel = new Channel<AgentEvent>(onEvent)
  return invoke<void>('agent_send', { request, onEvent: channel })
}

export function agentStop(chatId: string) {
  return invoke<void>('agent_stop', { chatId })
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
}
