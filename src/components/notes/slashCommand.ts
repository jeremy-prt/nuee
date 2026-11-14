import { type ChainedCommands, Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import type { Component } from 'vue'
import NotesSlashMenu from '@/components/notes/NotesSlashMenu.vue'
import { normalize } from '@/utils/search'

export type SlashGroup = 'text' | 'lists' | 'insert'
// `hint` : le raccourci markdown qui donne le même bloc en tapant, montré à droite comme dans Notion. `icon` : un
// glyphe, ou un texte court (« H1 ») là où le glyphe serait illisible à cette taille.
export type SlashItem = {
  id: string
  group: SlashGroup
  label: string
  hint: string
  icon: Component | string
  run: (chain: ChainedCommands) => ChainedCommands
}

// Menu « / » de l'éditeur des notes, comme Notion : le texte tapé après le « / » filtre les blocs, Entrée insère.
// `items` est relu à chaque frappe : les libellés suivent la langue de l'interface.
export const SlashCommand = Extension.create<{ items: () => SlashItem[] }>({
  name: 'slashCommand',

  addOptions() {
    return { items: () => [] }
  },

  addProseMirrorPlugins() {
    const all = this.options.items
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        pluginKey: new PluginKey('slashCommand'),
        items: ({ query }) => all().filter((item) => normalize(item.label).includes(normalize(query))),
        command: ({ editor, range, props }) => props.run(editor.chain().focus().deleteRange(range)).run(),
        render: () => {
          let menu: VueRenderer | undefined
          let unmount: (() => void) | undefined
          return {
            onStart: (props) => {
              menu = new VueRenderer(NotesSlashMenu, { props, editor: props.editor })
              if (menu.element instanceof HTMLElement) unmount = props.mount(menu.element)
            },
            onUpdate: (props) => menu?.updateProps(props),
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') return false
              return (menu?.ref as { onKeyDown?: (event: KeyboardEvent) => boolean } | undefined)?.onKeyDown?.(event) ?? false
            },
            onExit: () => {
              unmount?.()
              menu?.destroy()
            },
          }
        },
      }),
    ]
  },
})
