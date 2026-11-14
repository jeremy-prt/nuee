<script setup lang="ts">
import {
  Bold,
  CodeBlock,
  CodeInline,
  Italic,
  LayoutList,
  ListChecks,
  ListOrdered,
  Quote,
  Separator,
  Strikethrough,
} from '@/components/ui/icons'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { useI18n } from 'vue-i18n'
import { type SlashItem, SlashCommand } from '@/components/notes/slashCommand'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Texte d'une note, mis en forme pendant la frappe comme Notion : « / » pour les blocs, une barre sur la sélection,
// raccourcis markdown (« ## », « - », « [ ] »). Le texte reste stocké en markdown : `#note` le redonne tel quel à l'agent.
const props = defineProps<{ text: string }>()
const emit = defineEmits<{ change: [text: string] }>()

const { t } = useI18n()

const blocks = (): SlashItem[] => [
  { id: 'h1', group: 'text', label: t('notes.blocks.heading1'), hint: '#', icon: 'H1', run: (chain) => chain.setHeading({ level: 1 }) },
  { id: 'h2', group: 'text', label: t('notes.blocks.heading2'), hint: '##', icon: 'H2', run: (chain) => chain.setHeading({ level: 2 }) },
  { id: 'h3', group: 'text', label: t('notes.blocks.heading3'), hint: '###', icon: 'H3', run: (chain) => chain.setHeading({ level: 3 }) },
  { id: 'quote', group: 'text', label: t('notes.blocks.quote'), hint: '>', icon: Quote, run: (chain) => chain.toggleBlockquote() },
  { id: 'bullet', group: 'lists', label: t('notes.blocks.bulletList'), hint: '-', icon: LayoutList, run: (chain) => chain.toggleBulletList() },
  { id: 'ordered', group: 'lists', label: t('notes.blocks.orderedList'), hint: '1.', icon: ListOrdered, run: (chain) => chain.toggleOrderedList() },
  { id: 'task', group: 'lists', label: t('notes.blocks.taskList'), hint: '[ ]', icon: ListChecks, run: (chain) => chain.toggleTaskList() },
  { id: 'code', group: 'insert', label: t('notes.blocks.code'), hint: '```', icon: CodeBlock, run: (chain) => chain.toggleCodeBlock() },
  { id: 'rule', group: 'insert', label: t('notes.blocks.divider'), hint: '---', icon: Separator, run: (chain) => chain.setHorizontalRule() },
]

const editor = useEditor({
  content: props.text,
  contentType: 'markdown',
  extensions: [
    StarterKit.configure({ link: { openOnClick: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
    Placeholder.configure({ placeholder: () => t('notes.bodyPlaceholder') }),
    SlashCommand.configure({ items: blocks }),
  ],
  editorProps: {
    attributes: {
      class: 'note-editor min-h-80 pb-10 text-sm outline-none select-text',
      'aria-label': t('notes.body'),
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    },
  },
  // À chaque frappe, sans délai : `useEditor` détruit l'éditeur avant nos propres hooks de démontage, un texte gardé
  // pour plus tard serait lu vide (note effacée en changeant de note juste après avoir tapé).
  onUpdate: ({ editor: current }) => {
    if (!current.isDestroyed) emit('change', clean(current.getMarkdown()))
  },
})

// Tiptap écrit une ligne vide en `&nbsp;` : du bruit dans le markdown redonné à l'agent.
function clean(markdown: string) {
  return markdown
    .replace(/^&nbsp;$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

const marks = [
  { id: 'bold', icon: Bold, toggle: 'toggleBold' },
  { id: 'italic', icon: Italic, toggle: 'toggleItalic' },
  { id: 'strike', icon: Strikethrough, toggle: 'toggleStrike' },
  { id: 'code', icon: CodeInline, toggle: 'toggleCode' },
] as const

defineExpose({ focus: () => editor.value?.commands.focus('start') })
</script>

<template>
  <div>
    <!-- Barre sur une sélection de texte, hors d'un bloc de code où la mise en forme n'a pas de sens. -->
    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :should-show="({ editor: current, state }) => !state.selection.empty && !current.isActive('codeBlock')"
      class="ui-glass z-40 flex gap-0.5 rounded-lg p-0.5"
    >
      <UiTooltip v-for="mark in marks" :key="mark.id" :label="t(`notes.format.${mark.id}`)" side="top">
        <button
          type="button"
          class="grid size-7 place-items-center rounded-md text-content/80 hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
          :class="{ 'bg-selection text-content': editor.isActive(mark.id) }"
          :aria-label="t(`notes.format.${mark.id}`)"
          :aria-pressed="editor.isActive(mark.id)"
          @mousedown.prevent
          @click="editor.chain().focus()[mark.toggle]().run()"
        >
          <component :is="mark.icon" class="size-3.5" aria-hidden="true" />
        </button>
      </UiTooltip>
    </BubbleMenu>
    <EditorContent :editor="editor" />
  </div>
</template>
