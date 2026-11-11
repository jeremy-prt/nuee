<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDock from '@/components/shell/ShellDock.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import { SIDE_BY_SIDE, ZONE_MIN, useLayoutStore } from '@/stores/layout'

// Panneau de droite, partagé en deux zones quand un volet est ouvert à côté : côte à côte s'il est assez large, sinon
// empilées. La seconde zone garde sa part (`asideRatio`) quand le panneau change de taille.
const { t } = useI18n()
const layout = useLayoutStore()

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
</script>

<template>
  <div ref="root" class="flex min-h-0 min-w-0" :class="beside ? 'flex-row' : 'flex-col'" data-right-dock>
    <ShellDock :key="layout.right.active ?? 'launcher'" :view="layout.right.active" class="min-h-0 min-w-0 flex-1" />
    <template v-if="aside">
      <ShellResizeHandle
        v-model="asideSize"
        v-bind="bounds"
        :orientation="beside ? 'vertical' : 'horizontal'"
        invert
        :label="t('dock.resizeAside')"
      />
      <ShellDock
        :key="`aside-${aside}`"
        :view="aside"
        class="min-h-0 min-w-0 shrink-0"
        :style="beside ? { width: `${asideSize}px` } : { height: `${asideSize}px` }"
      />
    </template>
  </div>
</template>
