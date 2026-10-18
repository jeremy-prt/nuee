import { Channel, invoke } from '@tauri-apps/api/core'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AgentStatus } from '@/ipc/bindings/AgentStatus'
import type { AppError } from '@/ipc/bindings/AppError'
import type { Attachment } from '@/ipc/bindings/Attachment'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'
import type { Rewind } from '@/ipc/bindings/Rewind'
import type { SessionSpec } from '@/ipc/bindings/SessionSpec'

// Se résout dès que le message est parti, avec le worktree où travaille l'agent ; les événements arrivent
// ensuite sur onEvent, jusqu'à turnEnd.
// recap : réponse coupée au tour précédent, rappelée à l'agent seulement si son process est neuf.
// command : commande de Nuée attachée au message, Rust y ajoute ses consignes.
export function agentSend(
  spec: SessionSpec,
  prompt: string,
  attachments: Attachment[],
  recap: string | null,
  command: ChatCommand | null,
  onEvent: (event: AgentEvent) => void,
) {
  const channel = new Channel<AgentEvent>(onEvent)
  return invoke<string | null>('agent_send', { spec, prompt, attachments, recap, command, onEvent: channel })
}

// Démarre le process du chat pendant que l'utilisateur écrit : le premier message part sans attendre. Rend le
// contexte déjà pris (prompt système, outils), null si le process ne peut pas le dire maintenant.
export function agentWarm(spec: SessionSpec) {
  return invoke<ContextUsage | null>('agent_warm', { spec })
}

// Ajoute un message à la réponse en cours. false : réponse déjà complète, il attend le tour suivant.
export function agentSteer(chatId: string, prompt: string, attachments: Attachment[]) {
  return invoke<boolean>('agent_steer', { chatId, prompt, attachments })
}

export function agentStop(chatId: string) {
  return invoke<void>('agent_stop', { chatId })
}

export function agentRewind(spec: SessionSpec, messageId: string) {
  return invoke<Rewind>('agent_rewind', { spec, messageId })
}

export function agentTaskOutput(chatId: string, taskId: string) {
  return invoke<string | null>('agent_task_output', { chatId, taskId })
}

export function agentStopTask(chatId: string, taskId: string) {
  return invoke<void>('agent_stop_task', { chatId, taskId })
}

// Réponse à une demande d'autorisation du mode Auto ; l'agent attend pour continuer.
export function agentApprove(chatId: string, requestId: string, allow: boolean) {
  return invoke<void>('agent_approve', { chatId, requestId, allow })
}

// Modèles de l'agent installé ; Rust le lit une fois par lancement de l'app.
export function agentCatalog(agent: AgentKind) {
  return invoke<Catalog>('agent_catalog', { agent })
}

// Emplacement, version, compte et quotas de l'agent. `path` : celui choisi à la main, repris par tous ses chats.
export function agentProbe(agent: AgentKind, path: string | null) {
  return invoke<AgentStatus>('agent_probe', { agent, path })
}

// Mise à jour par la CLI elle-même ; renvoie sa dernière ligne (« déjà à jour », renvoi vers brew...).
export function agentUpdate(agent: AgentKind) {
  return invoke<string>('agent_update', { agent })
}

// Connexion du compte par la CLI de l'agent. onPage : la page de connexion est ouverte, la CLI attend le code ;
// la promesse se résout quand le compte est enregistré.
export function agentLogin(agent: AgentKind, onPage: () => void) {
  return invoke<void>('agent_login', { agent, onPage: new Channel<null>(() => onPage()) })
}

// Code affiché par la page de connexion, transmis à la CLI.
export function agentLoginCode(code: string) {
  return invoke<void>('agent_login_code', { code })
}

export function agentLoginOpen() {
  return invoke<void>('agent_login_open')
}

export function agentLoginCancel() {
  return invoke<void>('agent_login_cancel')
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
}
