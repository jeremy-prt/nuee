<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, LanguageDescription, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

// Éditeur de texte du volet Fichiers : CodeMirror, langage deviné du nom (chargé à la demande), couleurs prises aux
// jetons de l'app pour suivre le thème et le mode clair. `text` n'est lu qu'à la création, ensuite `replace`.
// `line` : ligne à montrer à l'ouverture (résultat de recherche).
const props = defineProps<{ text: string; name: string; label: string; line?: number }>()
const emit = defineEmits<{ change: [text: string] }>()

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: 'var(--color-violet)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--color-success)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--color-orange)' },
  { tag: [tags.comment, tags.meta], color: 'var(--color-muted)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--color-info)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--color-warning)' },
  { tag: [tags.tagName, tags.heading], color: 'var(--color-danger)', fontWeight: '600' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--color-mention)' },
  { tag: [tags.link, tags.url], color: 'var(--color-info)', textDecoration: 'underline' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.invalid, color: 'var(--color-danger)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', color: 'var(--color-content)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--color-content)', paddingBlock: '8px' },
  '.cm-cursor': { borderInlineStartColor: 'var(--color-content)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', opacity: '0.7' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--color-selection-hover)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--color-selection) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--color-selection-inner)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--color-selection)', outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--color-popover)', color: 'var(--color-content)', borderColor: 'var(--color-stroke)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--color-warning) 30%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--color-warning) 55%, transparent)' },
})

const host = useTemplateRef('host')
const language = new Compartment()
let view: EditorView | null = null
// Texte posé par `replace` : ne revient pas en `change`.
let applying = false

async function loadLanguage(name: string) {
  const found = LanguageDescription.matchFilename(languages, name)
  if (!found) {
    view?.dispatch({ effects: language.reconfigure([]) })
    return
  }
  try {
    const support = await found.load()
    if (view && props.name === name) view.dispatch({ effects: language.reconfigure(support) })
  } catch {
    // Langage introuvable : le texte reste lisible sans couleurs.
  }
}

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        syntaxHighlighting(highlight),
        language.of([]),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.contentAttributes.of({
          'aria-label': props.label,
          autocorrect: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          writingsuggestions: 'false',
        }),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applying) emit('change', update.state.doc.toString())
        }),
      ],
    }),
  })
  loadLanguage(props.name)
  if (props.line) goto(props.line)
})

function goto(line: number) {
  if (!view) return
  const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
  view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
  view.focus()
}

watch(
  () => props.line,
  (line) => line && goto(line),
)

watch(
  () => props.name,
  (name) => loadLanguage(name),
)

// Texte repris du disque : le curseur reste où il était, dans la limite du nouveau texte.
function replace(text: string) {
  if (!view || text === view.state.doc.toString()) return
  const head = Math.min(view.state.selection.main.head, text.length)
  applying = true
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head } })
  applying = false
}

defineExpose({ replace })

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div ref="host" class="flex min-h-0 flex-1 flex-col select-text" />
</template>
