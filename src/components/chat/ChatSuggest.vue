<script setup lang="ts">
import { type Component, computed, ref, useTemplateRef, watch } from 'vue'

export type Suggestion = { key: string; label: string; hint?: string; icon?: Component; iconProps?: Record<string, unknown> }

// Liste qui s'ouvre au-dessus du champ de saisie (menus « / » et « @ ») ; le champ garde le focus et lui passe ses touches.
// `query` : ce qui est tapé après le déclencheur, null hors de lui. Échap ferme la liste jusqu'à la frappe suivante.
// `empty` : message montré quand rien ne correspond ; sans lui, la liste reste fermée.
const props = defineProps<{ id: string; label: string; query: string | null; items: Suggestion[]; empty?: string }>()
const emit = defineEmits<{ choose: [key: string] }>()

const active = ref(0)
const dismissed = ref(false)
const list = useTemplateRef('list')

const open = computed(() => props.query !== null && !dismissed.value && (props.items.length > 0 || !!props.empty))
const optionId = (index: number) => `${props.id}-${index}`
const activeId = computed(() => (open.value && props.items.length ? optionId(active.value) : undefined))

watch(
  () => props.query,
  () => (dismissed.value = false),
)
watch(
  () => props.items,
  () => (active.value = 0),
)

// Défile la liste seule : scrollIntoView ferait aussi défiler les cadres parents, même ceux sans barre.
watch(
  [active, () => props.items],
  () => {
    const box = list.value
    const option = box?.children[active.value] as HTMLElement | undefined
    if (!box || !option) return
    const bottom = option.offsetTop + option.offsetHeight
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight
  },
  { flush: 'post' },
)

// Navigation standard d'une liste, hors raccourcis réglables. Avec un modificateur, la touche garde son
// rôle habituel (⌘Entrée envoie le message tel quel). Vrai si la touche a servi au menu.
function keydown(event: KeyboardEvent) {
  if (!open.value || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  const count = props.items.length
  if (event.key === 'Escape') dismissed.value = true
  else if (!count) return false
  else if (event.key === 'ArrowDown') active.value = (active.value + 1) % count
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + count) % count
  else if (event.key === 'Enter' || event.key === 'Tab') emit('choose', props.items[active.value]!.key)
  else return false
  event.preventDefault()
  return true
}

defineExpose({ open, activeId, keydown })
</script>

<template>
  <!-- mousedown empêché : le focus reste dans le champ de saisie. -->
  <div v-if="open" class="ui-glass absolute inset-x-0 bottom-full z-10 mb-1.5 rounded-lg p-1 text-xs select-none">
    <p v-if="!items.length" role="status" class="px-2 py-1.5 text-muted">{{ empty }}</p>
    <ul v-else :id="id" ref="list" role="listbox" :aria-label="label" class="relative flex max-h-60 flex-col gap-0.5 overflow-y-auto" @mousedown.prevent>
      <li
        v-for="(item, index) in items"
        :id="optionId(index)"
        :key="item.key"
        role="option"
        :aria-selected="index === active"
        class="flex shrink-0 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-content/75 aria-selected:bg-selection-hover aria-selected:text-content"
        @pointermove="active = index"
        @click="emit('choose', item.key)"
      >
        <span class="flex max-w-1/2 shrink-0 items-center gap-2 truncate">
          <component :is="item.icon" v-if="item.icon" v-bind="item.iconProps" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ item.label }}</span>
        </span>
        <span v-if="item.hint" class="min-w-0 flex-1 truncate text-muted">{{ item.hint }}</span>
      </li>
    </ul>
  </div>
</template>
