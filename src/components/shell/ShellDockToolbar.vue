<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { DockView, DockZone } from '@/stores/layout'

// Zone du panneau où le volet est affiché, donnée par `ShellDock`, et nombre de lignes d'outils montées : sans elle
// (état vide d'un volet), `ShellDock` pose lui-même la croix de la zone.
export const DOCK_ZONE: InjectionKey<{ zone: ComputedRef<DockZone>; view: ComputedRef<DockView | null>; toolbars: Ref<number> }> = Symbol('dockZone')
</script>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide } from 'vue'
import ShellDockZoneClose from '@/components/shell/ShellDockZoneClose.vue'
import { TOOLTIP_SIDE } from '@/components/ui/UiTooltip.vue'

// Ligne d'outils d'un volet, sous les onglets du panneau : même hauteur et même trait dans tous les volets, comme la
// barre de titre des vues de VS Code (contexte à gauche, actions à droite). Ses infobulles s'ouvrent en dessous :
// au-dessus, elles couvraient les onglets du panneau et clignotaient.
const props = withDefaults(defineProps<{ label: string; tooltipSide?: 'top' | 'bottom' }>(), { tooltipSide: 'bottom' })
provide(TOOLTIP_SIDE, props.tooltipSide)

const dock = inject(DOCK_ZONE, null)
if (dock) {
  dock.toolbars.value++
  onBeforeUnmount(() => dock.toolbars.value--)
}
// La croix du volet au bout de sa ligne, comme un groupe d'éditeurs de VS Code (les onglets du panneau n'en ont plus).
const closable = computed(() => !!dock?.view.value)
</script>

<template>
  <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke ps-2 pe-1.5" role="toolbar" :aria-label="label" data-dock-toolbar>
    <div class="flex min-w-0 flex-1 items-center gap-0.5">
      <slot />
    </div>
    <div v-if="$slots.end || closable" class="flex shrink-0 items-center gap-0.5">
      <slot name="end" />
      <span v-if="$slots.end && closable" class="mx-0.5 h-4 w-px bg-stroke" aria-hidden="true" />
      <ShellDockZoneClose v-if="closable" :zone="dock!.zone.value" :view="dock!.view.value!" />
    </div>
  </div>
</template>
