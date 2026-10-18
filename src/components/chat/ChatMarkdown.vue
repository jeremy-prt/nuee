<script setup lang="ts">
import { Lexer, type Token, type Tokens } from 'marked'
import { computed, h, type VNodeChild } from 'vue'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import ChatSkillResult from '@/components/chat/ChatSkillResult.vue'
import { i18nGlobal } from '@/i18n'
import { parseSkillResult } from '@/utils/skillResult'

// Markdown d'agent rendu en nœuds Vue, jamais en HTML brut : le HTML du texte reste du texte.
// Les liens ne sont pas cliquables : un clic ferait naviguer la webview elle-même.

const CODE_BLOCK = 'overflow-x-auto rounded-md bg-selection/60 p-3 font-mono text-xs leading-relaxed'

function blocks(tokens: Token[]): VNodeChild[] {
  return tokens.map(block)
}

function block(token: Token): VNodeChild {
  switch (token.type) {
    case 'paragraph':
      return h('p', { class: 'my-2' }, inline((token as Tokens.Paragraph).tokens))
    case 'heading': {
      const heading = token as Tokens.Heading
      const size = heading.depth === 1 ? 'text-base' : 'text-sm'
      return h(`h${Math.min(heading.depth + 1, 6)}`, { class: `mt-4 mb-2 font-semibold ${size}` }, inline(heading.tokens))
    }
    case 'code': {
      const code = token as Tokens.Code
      if (code.lang === 'nuee-skill') {
        const result = parseSkillResult(code.text)
        if (result) return h(ChatSkillResult, { result })
        // JSON encore incomplet pendant la réponse ; s'il reste illisible à la fin, le bloc brut s'affiche.
        if (props.streaming) return null
      }
      return h('div', { class: 'group relative my-2' }, [
        h('pre', { class: CODE_BLOCK }, h('code', code.text)),
        h(
          'div',
          {
            class:
              'absolute end-1 top-1 rounded-md bg-surface opacity-0 transition-opacity duration-(--hover-duration) group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none',
          },
          h(ChatCopyButton, { text: () => code.text, label: i18nGlobal().t('chat.copy.code') }),
        ),
      ])
    }
    case 'blockquote':
      return h('blockquote', { class: 'my-2 border-s-2 border-stroke ps-3 text-muted' }, blocks((token as Tokens.Blockquote).tokens))
    case 'list': {
      const list = token as Tokens.List
      const style = list.ordered ? 'list-decimal' : 'list-disc'
      const items = list.items.map((item) => h('li', { class: item.task ? 'list-none' : undefined }, blocks(item.tokens)))
      return h(list.ordered ? 'ol' : 'ul', { class: `my-2 ps-5 ${style}`, start: list.start || undefined }, items)
    }
    case 'table':
      return table(token as Tokens.Table)
    case 'hr':
      return h('hr', { class: 'my-4 border-stroke' })
    case 'text': {
      const text = token as Tokens.Text
      return text.tokens ? inline(text.tokens) : text.text
    }
    case 'checkbox':
      return h('input', { type: 'checkbox', checked: (token as Tokens.Checkbox).checked, disabled: true, class: 'me-1.5 align-middle' })
    case 'space':
    case 'def':
      return null
    default:
      return token.raw
  }
}

function inline(tokens: Token[] = []): VNodeChild[] {
  return tokens.map((token) => {
    switch (token.type) {
      case 'strong':
        return h('strong', { class: 'font-semibold' }, inline((token as Tokens.Strong).tokens))
      case 'em':
        return h('em', inline((token as Tokens.Em).tokens))
      case 'del':
        return h('del', inline((token as Tokens.Del).tokens))
      case 'codespan':
        return h('code', { class: 'rounded bg-selection px-1 py-0.5 font-mono text-[0.85em]' }, (token as Tokens.Codespan).text)
      case 'br':
        return h('br')
      case 'link': {
        const link = token as Tokens.Link
        return h('span', { class: 'text-accent underline underline-offset-2', title: link.href }, inline(link.tokens))
      }
      case 'image':
        return (token as Tokens.Image).text
      case 'text':
      case 'escape': {
        const text = token as Tokens.Text
        return text.tokens ? inline(text.tokens) : text.text
      }
      default:
        return block(token)
    }
  })
}

function table(token: Tokens.Table) {
  const cell = (tag: 'th' | 'td', item: Tokens.TableCell) =>
    h(tag, { class: 'border border-stroke px-2 py-1 text-start', style: item.align ? { textAlign: item.align } : undefined }, inline(item.tokens))
  return h('div', { class: 'my-2 overflow-x-auto' }, [
    h('table', { class: 'border-collapse text-xs' }, [
      h('thead', h('tr', token.header.map((item) => cell('th', item)))),
      h('tbody', token.rows.map((row) => h('tr', row.map((item) => cell('td', item))))),
    ]),
  ])
}

// streaming : l'agent écrit encore ce texte.
const props = defineProps<{ text: string; streaming?: boolean }>()

// Pendant l'écriture, seule la fin est relue à chaque bout de texte : le début, coupé sur une ligne vide hors d'un
// bloc de code, garde ses blocs déjà lus. Le texte fini est relu en entier (une liste coupée en deux se recolle).
let head = { text: '', tokens: [] as Token[] }

function safeCut(text: string) {
  for (let at = text.lastIndexOf('\n\n'); at > 0; at = text.lastIndexOf('\n\n', at - 1)) {
    if ((text.slice(0, at).match(/^(```|~~~)/gm)?.length ?? 0) % 2 === 0) return at + 2
  }
  return 0
}

const tokens = computed(() => {
  const text = props.text
  if (!props.streaming) return Lexer.lex(text)
  const cut = safeCut(text)
  if (cut !== head.text.length || !text.startsWith(head.text)) head = { text: text.slice(0, cut), tokens: Lexer.lex(text.slice(0, cut)) }
  return [...head.tokens, ...Lexer.lex(text.slice(cut))]
})
const Rendered = () => blocks(tokens.value)
</script>

<template>
  <!-- Sans marge en tête ni en fin, la ligne copier est à la même distance du texte que sous une bulle. -->
  <div class="text-sm leading-relaxed break-words select-text [&_li>:first-child]:mt-0 [&_li>:last-child]:mb-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0"><Rendered /></div>
</template>
