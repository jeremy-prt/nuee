<script lang="ts">
import type { InjectionKey } from 'vue'

type Side = 'top' | 'right' | 'bottom' | 'left'

// Côté par défaut des infobulles d'une zone (la ligne d'outils d'un volet les ouvre en dessous).
export const TOOLTIP_SIDE: InjectionKey<Side> = Symbol('tooltipSide')
</script>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, inject, ref, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    shortcut?: string
    side?: Side
    sideOffset?: number
    disabled?: boolean
  }>(),
  { side: undefined, sideOffset: 6, shortcut: undefined },
)

// Au-dessus par défaut (choix de Jérémy) ; reka la retourne en dessous quand la place manque (barre de titre).
const inherited = inject(TOOLTIP_SIDE, 'top')
const placed = computed(() => props.side ?? inherited)

// Un menu, un popover ou une liste ouverts ailleurs : pas d'infobulle par-dessus, elle les masquait au survol des
// boutons voisins. Celles des éléments du menu ouvert restent.
const MENUS = '[data-reka-popper-content-wrapper] :is([role="menu"], [role="dialog"], [role="listbox"])'
const open = ref(false)
const trigger = useTemplateRef<{ $el: Element }>('trigger')
function setOpen(value: boolean) {
  const host = trigger.value?.$el
  open.value = value && ![...document.querySelectorAll(MENUS)].some((menu) => !host || !menu.contains(host))
}
</script>

<template>
  <TooltipRoot :open="open" :disabled="disabled" @update:open="setOpen">
    <TooltipTrigger ref="trigger" as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="placed"
        :side-offset="sideOffset"
        :collision-padding="8"
        class="ui-tip z-50 flex max-w-80 items-center gap-3 rounded-md px-2 py-1 text-xs leading-4 font-medium text-content select-none"
      >
        <span class="min-w-0 break-words">{{ label }}</span>
        <kbd v-if="shortcut" class="ms-auto shrink-0 font-sans font-normal tracking-wide text-muted">{{ shortcut }}</kbd>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
