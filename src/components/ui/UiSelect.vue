<script setup lang="ts">
import { ChevronDown } from '@/components/ui/icons'
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { menuLabel, menuPanel, menuRow } from '@/components/ui/menuRow'

export interface UiSelectOption {
  value: string
  label: string
  hint?: string
}

withDefaults(
  defineProps<{
    label: string
    options: UiSelectOption[]
    disabled?: boolean
    side?: 'top' | 'bottom'
  }>(),
  { side: 'bottom' },
)
const model = defineModel<string>({ required: true })

// Ouvert à la souris, le menu ne rend pas le focus à son bouton : le contour de focus clavier s'y
// afficherait sans raison. Au clavier, le focus revient au bouton pour continuer à naviguer.
let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}

function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger
      :aria-label="label"
      data-control
      class="flex h-7 min-w-24 cursor-pointer items-center justify-between gap-2 rounded-md border border-stroke ps-2.5 pe-2 text-xs whitespace-nowrap hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-selection"
      @pointerdown="openedBy(true)"
      @keydown="openedBy(false)"
    >
      <SelectValue />
      <ChevronDown class="size-3 shrink-0 text-muted" aria-hidden="true" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side="side"
        :side-offset="6"
        :class="[menuPanel, 'max-h-(--reka-select-content-available-height) min-w-(--reka-select-trigger-width)']"
        @close-auto-focus="onCloseAutoFocus"
      >
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :class="[menuRow, option.hint ? 'py-2' : 'py-1.5']"
          >
            <span class="min-w-0 flex-1">
              <SelectItemText :class="menuLabel">{{ option.label }}</SelectItemText>
              <!-- Aide des réglages parfois longue : elle passe à la ligne au lieu d'être coupée. -->
              <span v-if="option.hint" class="block text-[11px] leading-4 text-muted">{{ option.hint }}</span>
            </span>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
