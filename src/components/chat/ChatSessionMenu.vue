<script setup lang="ts">
import { ChevronDown } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { menuPanel } from '@/components/ui/menuRow'
import { useMenuToggle } from '@/composables/useMenuToggle'

// Ligne du volet Environnement qui ouvre un menu à sa largeur, d'un clic n'importe où sur elle.
defineProps<{ label?: string; disabled?: boolean }>()
const emit = defineEmits<{ open: [open: boolean] }>()
const { open, onTriggerDown, onOpenChange } = useMenuToggle()

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
</script>

<template>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="(value) => (onOpenChange(value), emit('open', open))">
    <DropdownMenuTrigger
      :disabled="disabled"
      :aria-label="label"
      class="flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-start text-[13px] hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:text-muted aria-expanded:bg-selection-hover"
      @pointerdown="(openedBy(true), onTriggerDown())"
      @keydown="openedBy(false)"
    >
      <slot />
      <ChevronDown class="size-4 shrink-0 text-muted" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="start"
        :side-offset="4"
        :collision-padding="8"
        :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-(--reka-dropdown-menu-trigger-width)']"
        @close-auto-focus="onCloseAutoFocus"
      >
        <slot name="menu" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
