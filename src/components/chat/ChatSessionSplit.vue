<script setup lang="ts">
import { ChevronDown } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { ref, useTemplateRef } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'

// Ligne du volet Environnement en deux parties, comme T3 Code : l'action courante, puis ⌄ pour les autres. Le menu
// s'aligne sur la ligne entière.
defineProps<{ menuLabel: string; disabled?: boolean; menuDisabled?: boolean }>()
const emit = defineEmits<{ run: [event: MouseEvent]; open: [open: boolean] }>()
const group = useTemplateRef('group')

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}

// Menu non modal : un clic sur sa flèche déjà ouverte le fermait (clic « dehors ») puis le rouvrait aussitôt.
// On retient s'il était ouvert à l'appui, et on refuse alors la réouverture qui suit.
const menuOpen = ref(false)
let pressedOpen = false
function onTriggerDown() {
  pressedOpen = menuOpen.value
  setTimeout(() => (pressedOpen = false), 400)
}
function onMenuOpen(value: boolean) {
  menuOpen.value = value && !pressedOpen
  if (value) pressedOpen = false
}

const half = 'flex h-full items-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <div
    ref="group"
    class="group/split flex h-8 w-full min-w-0 items-center rounded-lg has-[[aria-expanded=true]]:bg-selection-hover"
    :class="{ 'hover:bg-selection-hover': !disabled || $slots.menu }"
  >
    <button
      type="button"
      :disabled="disabled"
      :class="[half, 'min-w-0 flex-1 gap-2.5 px-2 text-start text-[13px] enabled:hover:bg-selection-hover disabled:text-muted', $slots.menu ? 'rounded-s-lg' : 'rounded-lg']"
      @click="emit('run', $event)"
    >
      <slot />
    </button>
    <template v-if="$slots.menu">
      <span class="h-4 w-px shrink-0 group-hover/split:bg-stroke group-has-[[aria-expanded=true]]/split:bg-stroke" aria-hidden="true" />
      <UiTooltip :label="menuLabel" side="bottom">
        <span class="flex h-full">
          <DropdownMenuRoot :open="menuOpen" :modal="false" @update:open="(value) => (onMenuOpen(value), emit('open', menuOpen))">
            <DropdownMenuTrigger
              :disabled="menuDisabled"
              :class="[half, 'w-8 shrink-0 justify-center rounded-e-lg text-muted hover:bg-selection-hover hover:text-content disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content']"
              :aria-label="menuLabel"
              @pointerdown="(openedBy(true), onTriggerDown())"
              @keydown="openedBy(false)"
            >
              <ChevronDown class="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                :reference="group ?? undefined"
                align="end"
                :side-offset="4"
                :collision-padding="8"
                :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-(--reka-popper-anchor-width)']"
                @close-auto-focus="onCloseAutoFocus"
                >
                <slot name="menu" />
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </UiTooltip>
    </template>
  </div>
</template>
