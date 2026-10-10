<script setup lang="ts">
import { FileText, GitCompare, SquareTerminal, X } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useDragStore } from '@/stores/drag'
import { type DockPosition, type DockView, useLayoutStore } from '@/stores/layout'

const props = defineProps<{ position: DockPosition }>()

const { t } = useI18n()
const layout = useLayoutStore()
const drag = useDragStore()
const { startViewDrag } = useLayoutDrag()

const icons = { terminal: SquareTerminal, changes: GitCompare, files: FileText }

const views = computed(() => layout.viewsIn(props.position))
const active = computed({
  get: () => layout[props.position].active ?? views.value[0] ?? 'terminal',
  set: (view) => {
    layout[props.position].active = view
  },
})
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col bg-chrome" :aria-label="t(`dock.${position}`)">
    <TabsRoot
      :model-value="active"
      class="flex min-h-0 flex-1 flex-col"
      @update:model-value="active = $event as DockView"
    >
      <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
        <TabsList class="flex min-w-0 items-center gap-1">
          <TabsTrigger
            v-for="view in views"
            :key="view"
            :value="view"
            class="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-accent data-[state=active]:bg-selection data-[state=active]:text-content"
            :class="{ 'opacity-50': drag.source?.kind === 'view' && drag.source.view === view }"
            @pointerdown="startViewDrag($event, view)"
          >
            <component :is="icons[view]" class="size-3.5" aria-hidden="true" />
            {{ t(`dock.${view}.title`) }}
          </TabsTrigger>
        </TabsList>
        <span class="flex-1" />
        <UiIconButton :label="t('dock.close')" @click="layout.toggleDock(position)">
          <X class="size-4" aria-hidden="true" />
        </UiIconButton>
      </div>

      <TabsContent
        v-for="view in views"
        :key="view"
        :value="view"
        class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center outline-none"
      >
        <component :is="icons[view]" class="size-6 text-muted" aria-hidden="true" />
        <p class="text-sm text-muted">{{ t(`dock.${view}.empty`) }}</p>
      </TabsContent>
    </TabsRoot>
  </section>
</template>
