import { Channel, invoke } from '@tauri-apps/api/core'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { McpServer } from '@/ipc/bindings/McpServer'

// Les serveurs démarrent en quelques secondes : onUpdate reçoit chaque relevé, la promesse le dernier.
export function mcpStatus(agent: AgentKind, onUpdate: (servers: McpServer[]) => void) {
  return invoke<McpServer[]>('mcp_status', { agent, onUpdate: new Channel<McpServer[]>(onUpdate) })
}

// Nouvel essai de connexion ; s'il réussit, les chats ouverts retentent aussi le serveur.
export function mcpCheck(agent: AgentKind, name: string) {
  return invoke<McpServer>('mcp_check', { agent, name })
}

// Ouvre l'autorisation du serveur dans le navigateur et se résout une fois validée, avec son nouvel état.
export function mcpLogin(agent: AgentKind, name: string) {
  return invoke<McpServer>('mcp_login', { agent, name })
}

export function mcpCancelLogin(name: string) {
  return invoke<void>('mcp_cancel_login', { name })
}

// Coupe ou rallume le serveur partout : écrit dans les réglages globaux de l'agent.
export function mcpSetEnabled(agent: AgentKind, name: string, enabled: boolean) {
  return invoke<void>('mcp_set_enabled', { agent, name, enabled })
}
