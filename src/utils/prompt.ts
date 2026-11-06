import type { Attachment } from '@/ipc/bindings/Attachment'

// Mention : `path` sans « @ » ni guillemets (un dossier finit par « / »).
export type PromptPart = { text: string; kind: 'skill' | null } | { text: string; kind: 'file'; path: string }

// `@"chemin avec espaces"` : forme des pièces jointes envoyées à Claude.
const MENTION = /(^|\s)(@(?:"[^"\n]*"|[^\s"]+))/g

/**
 * Découpe la saisie pour colorer le skill en tête de message (Claude ne lit `/` qu'au début) et les `@fichier`.
 * Un `/` ou un `@` qui ne cite ni un skill ni un fichier de `files` reste du texte.
 */
export function promptParts(text: string, skills: ReadonlySet<string>, files?: ReadonlySet<string>): PromptPart[] {
  const parts: PromptPart[] = []
  const skill = /^\/(\S+)/.exec(text)
  let cursor = 0
  if (skill && skills.has(skill[1]!)) {
    parts.push({ text: skill[0], kind: 'skill' })
    cursor = skill[0].length
  }
  MENTION.lastIndex = cursor
  for (let match = MENTION.exec(text); match && files?.size; match = MENTION.exec(text)) {
    const path = match[2]!.replace(/^@"?|"$/g, '')
    if (!files.has(path)) continue
    const start = match.index + match[1]!.length
    if (start > cursor) parts.push({ text: text.slice(cursor, start), kind: null })
    parts.push({ text: match[2]!, kind: 'file', path })
    cursor = start + match[2]!.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), kind: null })
  return parts
}

// `/compact`, avec ou sans consignes. Avec des pièces jointes, il reste une bulle pour qu'elles restent visibles.
export function isCompaction(prompt: string, attachments: readonly Attachment[]) {
  return !attachments.length && /^\/compact(\s|$)/.test(prompt.trim())
}
