<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

export interface UiSelectOption {
  value: string
  label: string
  hint?: string
}

// `ghost` : discret, dans une barre d'outils (zone de saisie). `field` : bouton encadré, dans les réglages.
// `focusAfter` : où rendre le focus une fois le choix fait (la zone de saisie du chat, par exemple).
const props = withDefaults(
  defineProps<{
    label: string
    options: UiSelectOption[]
    disabled?: boolean
    variant?: 'ghost' | 'field'
    side?: 'top' | 'bottom'
    focusAfter?: () => void
  }>(),
  { variant: 'ghost', side: 'top' },
)
const model = defineModel<string>({ required: true })

// Ouvert à la souris, le menu ne rend pas le focus à son bouton : le contour de focus clavier s'y
// afficherait sans raison. Au clavier, le focus revient au bouton pour continuer à naviguer.
let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}

function onCloseAutoFocus(event: Event) {
  if (props.focusAfter) {
    event.preventDefault()
    props.focusAfter()
  } else if (byPointer) {
    event.preventDefault()
  }
}
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger
      :aria-label="label"
      :title="variant === 'ghost' ? label : undefined"
      class="group flex items-center focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      :class="
        variant === 'field'
          ? 'h-7 min-w-24 cursor-pointer justify-between gap-2 rounded-md border border-stroke ps-2.5 pe-2 text-xs hover:bg-selection-hover data-[state=open]:bg-selection'
          : 'h-6 gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-selection-hover hover:text-content data-[state=open]:bg-selection data-[state=open]:text-content'
      "
      @pointerdown="openedBy(true)"
      @keydown="openedBy(false)"
    >
      <SelectValue />
      <ChevronDown
        class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side="side"
        :side-offset="6"
        class="ui-pop z-50 max-h-(--reka-select-content-available-height) min-w-(--reka-select-trigger-width) overflow-y-auto p-1 text-xs text-content select-none"
        @close-auto-focus="onCloseAutoFocus"
      >
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="flex cursor-pointer items-start gap-2 rounded-md py-1.5 ps-1.5 pe-2.5 text-content/75 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content"
          >
            <span class="grid size-3.5 shrink-0 place-items-center pt-px">
              <SelectItemIndicator><Check class="size-3" aria-hidden="true" /></SelectItemIndicator>
            </span>
            <span class="min-w-0 flex-1">
              <SelectItemText>{{ option.label }}</SelectItemText>
              <span v-if="option.hint" class="mt-0.5 block text-muted">{{ option.hint }}</span>
            </span>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
