import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'

// Couleurs du code, les mêmes partout (éditeur de l'Explorateur, blocs de code et commandes du fil) : des classes
// `tok-*` posées par CodeMirror, teintées dans main.css par les jetons de l'app (thème et mode clair suivis).
export const codeHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], class: 'tok-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'tok-number' },
  { tag: [tags.comment, tags.meta], class: 'tok-comment' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'tok-function' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
  { tag: [tags.tagName, tags.heading], class: 'tok-tag' },
  { tag: [tags.attributeName, tags.propertyName], class: 'tok-property' },
  { tag: [tags.link, tags.url], class: 'tok-link' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.invalid, class: 'tok-invalid' },
])

export type CodeSegment = { text: string; class: string | null }

// Au-delà, le texte reste sans couleurs : un très long bloc coûterait plus qu'il n'apporte.
const LIMIT = 50_000

// Morceaux colorés d'un code, rendus en nœuds Vue (jamais en HTML). Null si le langage est inconnu.
export async function highlightCode(code: string, lang: string): Promise<CodeSegment[] | null> {
  if (!lang || code.length > LIMIT) return null
  const found = LanguageDescription.matchLanguageName(languages, lang.trim(), true)
  if (!found) return null
  const support = await found.load()
  const tree = support.language.parser.parse(code)
  const segments: CodeSegment[] = []
  let at = 0
  highlightTree(tree, codeHighlighter, (from, to, classes) => {
    if (from > at) segments.push({ text: code.slice(at, from), class: null })
    segments.push({ text: code.slice(from, to), class: classes })
    at = to
  })
  if (at < code.length) segments.push({ text: code.slice(at), class: null })
  return segments
}
