import type { ChatItem } from '@/stores/conversations'

const TITLE_LENGTH = 80
const TOOL_LENGTH = 200

// Ce que le markdown ajoute autour du texte : titres, listes, citations, emphase, code.
function plain(line: string) {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

// Titre d'une note faite d'un texte : son premier titre markdown, sinon sa première ligne hors bloc de code.
export function noteTitle(text: string) {
  const lines = text.split('\n')
  const heading = lines.find((line) => /^\s{0,3}#{1,6}\s+\S/.test(line))
  let fenced = false
  const first = lines.find((line) => {
    if (/^\s*```/.test(line)) fenced = !fenced
    else if (!fenced && plain(line)) return true
    return false
  })
  const title = plain(heading ?? first ?? '')
  return title.length > TITLE_LENGTH ? `${title.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : title
}

// Aperçu d'une ligne dans la liste des notes, sans la syntaxe markdown.
export function notePreview(body: string) {
  return body
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .map(plain)
    .filter(Boolean)
    .join(' ')
    .slice(0, 160)
}

// Conversation pour le résumé : messages en entier, réponses de l'agent, une ligne par commande ou fichier modifié.
// Les sorties d'outils, qui font l'essentiel du volume, restent de côté.
export function sessionTranscript(items: readonly ChatItem[], names: { user: string; agent: string }) {
  const blocks: string[] = []
  for (const item of items) {
    if (item.kind === 'user' && item.text.trim()) blocks.push(`## ${names.user}\n\n${item.text.trim()}`)
    else if (item.kind === 'text' && item.text.trim()) blocks.push(`## ${names.agent}\n\n${item.text.trim()}`)
    else if (item.kind === 'tool' && (item.tool === 'command' || item.tool === 'edit') && item.summary) {
      const summary = item.summary.length > TOOL_LENGTH ? `${item.summary.slice(0, TOOL_LENGTH)}…` : item.summary
      blocks.push(`- ${item.name}: ${summary}${item.status === 'failed' ? ' (failed)' : ''}`)
    }
  }
  return blocks.join('\n\n')
}
