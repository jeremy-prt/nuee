<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDock from '@/components/shell/ShellDock.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import { useDragStore } from '@/stores/drag'
import { type DockView, type DockZone, SIDE_BY_SIDE, ZONE_MIN, useLayoutStore } from '@/stores/layout'

// Panneau de droite, partagé en deux zones quand un volet est ouvert à côté : côte à côte s'il est assez large, sinon
// empilées. La seconde zone garde sa part (`asideRatio`) quand le panneau change de taille.
const { t } = useI18n()
const layout = useLayoutStore()
const drag = useDragStore()

const root = useTemplateRef('root')
const box = ref({ width: 0, height: 0 })
const observer = new ResizeObserver(([entry]) => {
  if (entry) box.value = { width: entry.contentRect.width, height: entry.contentRect.height }
})
watch(root, (element, before) => {
  if (before) observer.unobserve(before)
  if (element) observer.observe(element)
})
onBeforeUnmount(() => observer.disconnect())

const aside = computed(() => (layout.right.active ? layout.right.aside : null))
const beside = computed(() => layout.right.size >= SIDE_BY_SIDE)
// La poignée compte pour 1 px.
const extent = computed(() => Math.max(0, (beside.value ? box.value.width : box.value.height) - 1))
const bounds = computed(() => ({
  min: ZONE_MIN,
  max: Math.max(ZONE_MIN, extent.value - ZONE_MIN),
  defaultSize: Math.round(extent.value / 2),
}))
const asideSize = computed({
  get: () => Math.min(bounds.value.max, Math.max(bounds.value.min, Math.round(extent.value * layout.right.asideRatio))),
  set: (size: number) => {
    if (extent.value) layout.right.asideRatio = size / extent.value
  },
})

// Une liste à clés plutôt que deux emplacements : quand les zones s'échangent, chaque volet est déplacé, pas recréé
// (un seul `TerminalPanel` et un seul `BrowserPane`, dont la page native se reposerait au mauvais endroit).
const zones = computed(() => {
  const list: { key: string; view: DockView | null; zone: DockZone }[] = [{ key: layout.right.active ?? 'launcher', view: layout.right.active, zone: 'start' }]
  if (aside.value) list.push({ key: aside.value, view: aside.value, zone: 'end' })
  return list
})

const zoneStyle = (zone: DockZone) => (zone === 'end' ? (beside.value ? { width: `${asideSize.value}px` } : { height: `${asideSize.value}px` }) : undefined)

// Zones de dépôt pendant qu'on tire un onglet du panneau (`startDockDrag`). Panneau simple : deux moitiés, sauf pour
// le volet déjà affiché ; partagé : les deux zones, celle du volet tiré exclue ; lanceur : tout le panneau.
const dragged = computed(() => (drag.source?.kind === 'dock' ? drag.source.view : null))
const drops = computed(() => {
  const view = dragged.value
  if (!view) return []
  const active = layout.right.active
  if (!active) return [{ zone: 'start' as DockZone, label: t('dock.drop.here') }]
  if (!aside.value) {
    if (view === active) return []
    return (['start', 'end'] as DockZone[]).map((zone) => ({ zone, label: t(`dock.drop.${placeKey(zone)}`) }))
  }
  const from = layout.zoneOf(view)
  return (['start', 'end'] as DockZone[]).map((zone) => {
    if (zone === from) return { zone, label: null }
    const shown = zone === 'start' ? active : aside.value!
    return { zone, label: from ? t('dock.drop.swap') : t('dock.drop.replace', { view: t(`dock.${shown}.title`) }) }
  })
})

function placeKey(zone: DockZone) {
  if (beside.value) return zone === 'start' ? 'left' : 'right'
  return zone === 'start' ? 'top' : 'bottom'
}

const target = computed(() => (drag.target?.kind === 'dock' ? drag.target.at : null))
</script>

<template>
  <div ref="root" class="relative flex min-h-0 min-w-0" :class="beside ? 'flex-row' : 'flex-col'" data-right-dock>
    <template v-for="item in zones" :key="item.key">
      <ShellResizeHandle
        v-if="item.zone === 'end'"
        v-model="asideSize"
        v-bind="bounds"
        :orientation="beside ? 'vertical' : 'horizontal'"
        invert
        :label="t('dock.resizeAside')"
      />
      <ShellDock
        :view="item.view"
        :zone="item.zone"
        class="min-h-0 min-w-0"
        :class="item.zone === 'end' ? 'shrink-0' : 'flex-1'"
        :style="zoneStyle(item.zone)"
      />
    </template>

    <!-- Mêmes proportions que les zones : la zone visée s'allume, comme le dépôt d'un onglet dans VS Code. -->
    <div
      v-if="drops.length"
      class="pointer-events-none absolute inset-0 z-10 flex bg-canvas animate-[ui-fade-in_var(--motion-quick)_var(--motion-ease)]"
      :class="beside ? 'flex-row' : 'flex-col'"
    >
      <template v-for="drop in drops" :key="drop.zone">
        <span v-if="drop.zone === 'end' && aside" class="shrink-0" :class="beside ? 'w-px' : 'h-px'" />
        <div
          class="flex min-h-0 min-w-0 p-1.5"
          :class="drop.zone === 'end' && aside ? 'shrink-0' : 'flex-1'"
          :style="aside ? zoneStyle(drop.zone) : undefined"
          :data-dock-drop="drop.label ? drop.zone : undefined"
        >
          <div
            v-if="drop.label"
            class="relative grid flex-1 place-items-center overflow-hidden rounded-lg border p-3 text-center text-xs transition-colors duration-(--motion-quick)"
            :class="target === drop.zone ? 'border-ring text-content' : 'border-dashed border-muted/40 text-muted'"
          >
            <span class="absolute inset-0 bg-signal/15 transition-opacity duration-(--motion-quick)" :class="{ 'opacity-0': target !== drop.zone }" />
            <span class="relative">{{ drop.label }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
