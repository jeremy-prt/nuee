import { invoke } from '@tauri-apps/api/core'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Skill } from '@/ipc/bindings/Skill'
import type { SkillMode } from '@/ipc/bindings/SkillMode'

// Skills de la config globale de l'agent, désignés par leur dossier (`id`) : c'est aussi la clé de leur réglage.
export function skillsList(agent: AgentKind) {
  return invoke<Skill[]>('skills_list', { agent })
}

export function skillsRead(agent: AgentKind, id: string) {
  return invoke<string>('skills_read', { agent, id })
}

export function skillsWrite(agent: AgentKind, id: string, content: string) {
  return invoke<void>('skills_write', { agent, id, content })
}

// Écrit dans les réglages globaux de l'agent : vaut aussi hors de Nuée.
export function skillsSetMode(agent: AgentKind, id: string, mode: SkillMode) {
  return invoke<void>('skills_set_mode', { agent, id, mode })
}

export function skillsTrash(agent: AgentKind, id: string) {
  return invoke<void>('skills_trash', { agent, id })
}

export function skillsReveal(agent: AgentKind, id: string) {
  return invoke<void>('skills_reveal', { agent, id })
}
