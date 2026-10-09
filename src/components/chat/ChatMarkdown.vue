<script setup lang="ts">
import { Lexer, type Token, type Tokens } from 'marked'
import { computed, h, type VNodeChild } from 'vue'

// Markdown d'agent rendu en nœuds Vue, jamais en HTML brut : le HTML du texte reste du texte.
// Les liens ne sont pas cliquables : un clic ferait naviguer la webview elle-même.

const CODE_BLOCK = 'my-2 overflow-x-auto rounded-md bg-selection/60 p-3 font-mono text-xs leading-relaxed'

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
    case 'code':
      return h('pre', { class: CODE_BLOCK }, h('code', (token as Tokens.Code).text))
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

const props = defineProps<{ text: string }>()

const tokens = computed(() => Lexer.lex(props.text))
const Rendered = () => blocks(tokens.value)
</script>

<template>
  <div class="text-sm leading-relaxed break-words select-text"><Rendered /></div>
</template>
