<script lang="ts">
import type { InjectionKey } from 'vue'

type Side = 'top' | 'right' | 'bottom' | 'left'

// Côté par défaut des infobulles d'une zone (la ligne d'outils d'un volet les ouvre en dessous).
export const TOOLTIP_SIDE: InjectionKey<Side> = Symbol('tooltipSide')
</script>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, inject } from 'vue'

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
</script>

<template>
  <TooltipRoot :disabled="disabled">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="placed"
        :side-offset="sideOffset"
        class="z-50 flex items-center gap-2 rounded-md border border-stroke bg-popover backdrop-blur-xl px-2 py-1 text-xs text-content shadow-lg select-none"
      >
        {{ label }}
        <kbd v-if="shortcut" class="font-sans text-muted">{{ shortcut }}</kbd>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
