<script setup lang="ts" generic="T extends { key: string; name: string; title: string }">
import { X } from '@/components/ui/icons'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'

// Onglets de l'éditeur d'un volet (Explorateur, volet Git). Comme T3 Code, ils montent dans la barre de titre
// (`inBar`, `ShellTitleBar` leur garde la place). L'aperçu est en italique ; slot `menu` : clic droit sur l'onglet.
defineProps<{ items: readonly T[]; open: string | null; preview: string | null; inBar: boolean; label: string; closeLabel: (name: string) => string }>()
const emit = defineEmits<{ select: [key: string]; pin: [key: string]; close: [key: string] }>()
defineSlots<{ icon(props: { item: T }): unknown; after?(props: { item: T }): unknown; menu?(props: { item: T }): unknown }>()

function onAuxClick(event: MouseEvent, key: string) {
  if (event.button === 1) emit('close', key)
}
</script>

<template>
  <Teleport defer to="#dock-editor-tabs" :disabled="!inBar">
    <div
      class="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto"
      :class="inBar ? 'h-full min-w-0 flex-1' : 'h-9 shrink-0 border-b border-stroke ps-1.5 pe-2.5'"
      role="tablist"
      :aria-label="label"
    >
      <component :is="$slots.menu ? UiContextMenu : 'div'" v-for="item in items" :key="item.key" class="group/tab relative w-44 min-w-24 shrink">
        <button
          type="button"
          role="tab"
          class="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 text-xs focus-visible:outline-2 focus-visible:outline-ring"
          :class="open === item.key ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
          :aria-selected="open === item.key"
          :title="item.title"
          @click="emit('select', item.key)"
          @dblclick="emit('pin', item.key)"
          @auxclick="onAuxClick($event, item.key)"
        >
          <slot name="icon" :item="item" />
          <span class="min-w-0 truncate" :class="{ italic: preview === item.key }">{{ item.name }}</span>
          <slot name="after" :item="item" />
        </button>
        <button
          type="button"
          class="absolute end-1 top-1 grid size-5 place-items-center rounded text-muted hover:bg-selection-inner hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          :class="open === item.key ? '' : 'opacity-0 group-hover/tab:opacity-100'"
          :aria-label="closeLabel(item.name)"
          @click="emit('close', item.key)"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
        <template v-if="$slots.menu" #menu>
          <slot name="menu" :item="item" />
        </template>
      </component>
    </div>
  </Teleport>
</template>
