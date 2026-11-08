import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { OperatorRequest } from './bindings/OperatorRequest'

// Outils de sessions appelés par un agent (serveur MCP `nuee`) : Rust attend la réponse du front.
export function onOperatorRequest(handler: (request: OperatorRequest) => void) {
  return listen<OperatorRequest>('operator-request', (event) => handler(event.payload))
}

export function operatorReply(id: number, ok: boolean, text: string) {
  return invoke<void>('operator_reply', { id, ok, text })
}
