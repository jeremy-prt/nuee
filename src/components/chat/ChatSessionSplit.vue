<script setup lang="ts">
import { ChevronDown } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useTemplateRef } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useMenuToggle } from '@/composables/useMenuToggle'

// Ligne du volet Environnement en deux parties, comme T3 Code : l'action courante, puis ⌄ pour les autres. Le menu
// s'aligne sur la ligne entière. `compact` (ligne d'outils d'un volet) : l'action n'est qu'une icône, `label` la nomme.
const props = defineProps<{ menuLabel: string; disabled?: boolean; menuDisabled?: boolean; compact?: boolean; label?: string }>()
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
const look = props.compact
  ? {
      group: 'h-7 rounded-md',
      run: 'w-7 justify-center rounded-s-md text-muted enabled:hover:text-content disabled:opacity-40',
      lone: 'rounded-md',
      menu: 'w-4 rounded-e-md',
      chevron: 'size-3',
      panel: 'min-w-52',
    }
  : {
      group: 'h-8 w-full min-w-0 rounded-lg',
      run: 'min-w-0 flex-1 gap-2.5 px-2 text-start text-[13px] disabled:text-muted',
      lone: 'rounded-lg',
      menu: 'w-8 rounded-e-lg',
      chevron: 'size-4',
      panel: 'w-(--reka-popper-anchor-width)',
    }
</script>

<template>
  <div
    ref="group"
    class="group/split flex shrink-0 items-center has-[[aria-expanded=true]]:bg-selection-hover"
    :class="[look.group, { 'hover:bg-selection-hover': !disabled || $slots.menu }]"
  >
    <UiTooltip :label="label ?? ''" :disabled="!label">
      <button
        type="button"
        :disabled="disabled"
        :aria-label="label"
        :class="[half, look.run, 'enabled:hover:bg-selection-hover', $slots.menu ? (compact ? 'rounded-s-md' : 'rounded-s-lg') : look.lone]"
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
              :class="[half, look.menu, 'shrink-0 justify-center text-muted hover:bg-selection-hover hover:text-content disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content']"
              :aria-label="menuLabel"
              @pointerdown="(openedBy(true), onTriggerDown())"
              @keydown="openedBy(false)"
            >
              <ChevronDown :class="look.chevron" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                :reference="group ?? undefined"
                align="end"
                :side-offset="4"
                :collision-padding="8"
                :class="[menuPanel, look.panel, 'max-h-(--reka-dropdown-menu-content-available-height)']"
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
