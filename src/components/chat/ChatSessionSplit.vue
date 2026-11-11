<script setup lang="ts">
import { ChevronDown } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useTemplateRef } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useMenuToggle } from '@/composables/useMenuToggle'

// Bouton compact en deux parties de la ligne d'outils du volet Modifications : l'action courante (icône seule, nommée
// par `label`), puis ⌄ pour les autres, dans un menu classique sous le bouton.
defineProps<{ label: string; menuLabel: string; disabled?: boolean; menuDisabled?: boolean }>()
const emit = defineEmits<{ run: [event: MouseEvent]; open: [open: boolean] }>()
const group = useTemplateRef('group')

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}

const { open: menuOpen, onTriggerDown, onOpenChange } = useMenuToggle()

const half = 'flex h-full items-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <div
    ref="group"
    class="group/split flex h-7 shrink-0 items-center rounded-md has-[[aria-expanded=true]]:bg-selection-hover"
    :class="{ 'hover:bg-selection-hover': !disabled || $slots.menu }"
  >
    <UiTooltip :label="label">
      <button
        type="button"
        :disabled="disabled"
        :aria-label="label"
        :class="[half, 'w-7 justify-center text-muted enabled:hover:bg-selection-hover enabled:hover:text-content disabled:opacity-40', $slots.menu ? 'rounded-s-md' : 'rounded-md']"
        @click="emit('run', $event)"
      >
        <slot />
      </button>
    </UiTooltip>
    <template v-if="$slots.menu">
      <span class="h-4 w-px shrink-0 group-hover/split:bg-stroke group-has-[[aria-expanded=true]]/split:bg-stroke" aria-hidden="true" />
      <UiTooltip :label="menuLabel" side="bottom">
        <span class="flex h-full">
          <DropdownMenuRoot :open="menuOpen" :modal="false" @update:open="(value) => (onOpenChange(value), emit('open', menuOpen))">
            <DropdownMenuTrigger
              :disabled="menuDisabled"
              :class="[half, 'w-4 shrink-0 rounded-e-md justify-center text-muted hover:bg-selection-hover hover:text-content disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content']"
              :aria-label="menuLabel"
              @pointerdown="(openedBy(true), onTriggerDown())"
              @keydown="openedBy(false)"
            >
              <ChevronDown class="size-3" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                :reference="group ?? undefined"
                align="end"
                :side-offset="4"
                :collision-padding="8"
                :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) min-w-52']"
                @close-auto-focus="onCloseAutoFocus"
              >
                <!-- `keyboard` : le menu a été ouvert au clavier, une action qui fait disparaître la ligne déplace le focus. -->
                <slot name="menu" :keyboard="!byPointer" />
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </UiTooltip>
    </template>
  </div>
</template>
