export type PromptPart = { text: string; kind: 'skill' | 'file' | 'folder' | null }

// `@"chemin avec espaces"` : forme des pièces jointes envoyées à Claude.
const MENTION = /(^|\s)(@(?:"[^"\n]*"|[^\s"]+))/g

/** Découpe la saisie pour colorer le skill en tête de message (Claude ne lit `/` qu'au début) et les `@fichier`. */
export function promptParts(text: string, skills: ReadonlySet<string>): PromptPart[] {
  const parts: PromptPart[] = []
  const skill = /^\/(\S+)/.exec(text)
  let cursor = 0
  if (skill && skills.has(skill[1]!)) {
    parts.push({ text: skill[0], kind: 'skill' })
    cursor = skill[0].length
  }
  MENTION.lastIndex = cursor
  for (let match = MENTION.exec(text); match; match = MENTION.exec(text)) {
    const start = match.index + match[1]!.length
    if (start > cursor) parts.push({ text: text.slice(cursor, start), kind: null })
    parts.push({ text: match[2]!, kind: /\/"?$/.test(match[2]!) ? 'folder' : 'file' })
    cursor = start + match[2]!.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), kind: null })
  return parts
}
