<script setup lang="ts">
import { PanelLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useLayoutStore } from '@/stores/layout'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const layout = useLayoutStore()
</script>

<template>
  <UiTooltip
    :label="t('rail.toggle')"
    :shortcut="shortcutLabel(shortcuts.toggleRail)"
    :side="layout.rail.expanded ? 'bottom' : 'right'"
    :side-offset="8"
  >
    <button
      type="button"
      class="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      :aria-label="t('rail.toggle')"
      aria-controls="shell-rail"
      :aria-expanded="layout.rail.expanded"
      @click="layout.toggleRail()"
    >
      <PanelLeft class="size-4" aria-hidden="true" />
    </button>
  </UiTooltip>
</template>
