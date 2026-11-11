<script setup lang="ts">
import { provide } from 'vue'
import { TOOLTIP_SIDE } from '@/components/ui/UiTooltip.vue'

// Ligne d'outils d'un volet, sous les onglets du panneau : même hauteur et même trait dans tous les volets, comme la
// barre de titre des vues de VS Code (contexte à gauche, actions à droite). Ses infobulles s'ouvrent en dessous :
// au-dessus, elles couvraient les onglets du panneau et clignotaient.
const props = withDefaults(defineProps<{ label: string; tooltipSide?: 'top' | 'bottom' }>(), { tooltipSide: 'bottom' })
provide(TOOLTIP_SIDE, props.tooltipSide)
</script>

<template>
  <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke ps-2 pe-1.5" role="toolbar" :aria-label="label" data-dock-toolbar>
    <div class="flex min-w-0 flex-1 items-center gap-0.5">
      <slot />
    </div>
    <div v-if="$slots.end" class="flex shrink-0 items-center gap-0.5">
      <slot name="end" />
    </div>
  </div>
</template>
