<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutStore } from '@/stores/layout'
import { useShortcutsStore } from '@/stores/shortcuts'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
</script>

<template>
  <UiIconButton
    :label="t('rail.toggle')"
    :shortcut="shortcuts.label('toggleRail')"
    aria-controls="shell-rail"
    :aria-expanded="layout.rail.expanded"
    @click="layout.toggleRail()"
  >
    <PanelLeftClose v-if="layout.rail.expanded" class="size-4" aria-hidden="true" />
    <PanelLeftOpen v-else class="size-4" aria-hidden="true" />
  </UiIconButton>
</template>
