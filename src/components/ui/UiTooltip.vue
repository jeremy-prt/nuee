<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

withDefaults(
  defineProps<{
    label: string
    shortcut?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
    sideOffset?: number
    disabled?: boolean
  }>(),
  { side: 'bottom', sideOffset: 6, shortcut: undefined },
)
</script>

<template>
  <TooltipRoot :disabled="disabled">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="sideOffset"
        class="z-50 flex items-center gap-2 rounded-md border border-stroke bg-overlay px-2 py-1 text-xs text-content shadow-lg select-none"
      >
        {{ label }}
        <kbd v-if="shortcut" class="font-sans text-muted">{{ shortcut }}</kbd>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
