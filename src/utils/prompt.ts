import type { Attachment } from '@/ipc/bindings/Attachment'

// Mention : `path` sans « @ » ni guillemets (un dossier finit par « / »). Skill : `name` sans « / ».
export type PromptPart = { text: string; kind: null } | { text: string; kind: 'skill'; name: string } | { text: string; kind: 'file'; path: string }

// `/skill` ou `@fichier` en début de mot ; `@"chemin avec espaces"` : forme des pièces jointes envoyées à Claude.
const TOKEN = /(^|\s)(\/[^\s/]\S*|@(?:"[^"\n]*"|[^\s"]+))/g

/**
 * Découpe la saisie pour colorer les skills et les `@fichier`. Un skill peut venir après du texte : la CLI n'exécute
 * que celui de tête, mais Claude reconnaît les autres et les lance. Un `/` ou un `@` qui ne cite ni un skill ni un
 * fichier de `files` reste du texte.
 */
export function promptParts(text: string, skills: ReadonlySet<string>, files?: ReadonlySet<string>): PromptPart[] {
  const parts: PromptPart[] = []
  let cursor = 0
  TOKEN.lastIndex = 0
  for (let match = TOKEN.exec(text); match; match = TOKEN.exec(text)) {
    const token = match[2]!
    const start = match.index + match[1]!.length
    let part: PromptPart | null = null
    if (token.startsWith('/')) {
      if (skills.has(token.slice(1))) part = { text: token, kind: 'skill', name: token.slice(1) }
    } else {
      const path = token.replace(/^@"?|"$/g, '')
      if (files?.has(path)) part = { text: token, kind: 'file', path }
    }
    if (!part) continue
    if (start > cursor) parts.push({ text: text.slice(cursor, start), kind: null })
    parts.push(part)
    cursor = start + token.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), kind: null })
  return parts
}

// `/compact`, avec ou sans consignes. Avec des pièces jointes, il reste une bulle pour qu'elles restent visibles.
export function isCompaction(prompt: string, attachments: readonly Attachment[]) {
  return !attachments.length && /^\/compact(\s|$)/.test(prompt.trim())
}
