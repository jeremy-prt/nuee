<script setup lang="ts">
import { Ellipsis } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Bouton « … » d'une ligne : même menu que son clic droit, et seul accès au clavier.
// `keepFocus` : l'action choisie place elle-même le focus (champ de renommage), le menu ne le rend pas au bouton.
const props = defineProps<{ label: string; keepFocus?: () => boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}

function onCloseAutoFocus(event: Event) {
  if (byPointer || props.keepFocus?.()) event.preventDefault()
}
</script>

<template>
  <UiTooltip :label="label">
    <span class="flex">
      <DropdownMenuRoot :modal="false" @update:open="emit('update:open', $event)">
        <DropdownMenuTrigger
          class="grid size-6 place-items-center rounded text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="label"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <Ellipsis class="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="start"
            :side-offset="4"
            :collision-padding="8"
            class="ui-pop z-50 max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-52 overflow-y-auto p-1 text-xs text-content select-none"
            @close-auto-focus="onCloseAutoFocus"
          >
            <slot />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
