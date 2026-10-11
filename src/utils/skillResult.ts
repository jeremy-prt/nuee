// Compte rendu d'un chat de skill : l'IA ne donne que ce JSON (bloc `nuee-skill`), Nuée en fait le message.
export type SkillResult =
  | { action: 'created'; name: string; summary: string; automatic: boolean }
  | { action: 'modified'; name: string; summary: string; changes: string }

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// null : JSON illisible, incomplet ou d'une autre forme.
export function parseSkillResult(source: string): SkillResult | null {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const { action, name, summary, automatic, changes } = data as Record<string, unknown>
  const about = text(summary)
  if (typeof name !== 'string' || name.length > 64 || !SKILL_NAME.test(name) || !about) return null
  if (automatic !== undefined && typeof automatic !== 'boolean') return null
  if (action === 'created' && typeof automatic === 'boolean') return { action, name, summary: about, automatic }
  const changed = text(changes)
  if (action === 'modified' && changed) return { action, name, summary: about, changes: changed }
  return null
}
