<script setup lang="ts">
import { PanelLeftClose } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutStore } from '@/stores/layout'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const layout = useLayoutStore()
</script>

<template>
  <UiIconButton
    :label="t('rail.toggle')"
    :shortcut="shortcutLabel(shortcuts.toggleRail)"
    aria-controls="shell-rail"
    :aria-expanded="layout.rail.expanded"
    @click="layout.toggleRail()"
  >
    <PanelLeftClose class="size-4" aria-hidden="true" />
  </UiIconButton>
</template>
