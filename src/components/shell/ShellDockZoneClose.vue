<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useDockFocus } from '@/composables/useDockFocus'
import { type DockZone, useLayoutStore } from '@/stores/layout'

// Croix d'une zone du panneau partagé : la zone disparaît, l'autre prend toute la place, le volet reste en onglet.
const props = defineProps<{ zone: DockZone }>()

const { t } = useI18n()
const layout = useLayoutStore()
const dockFocus = useDockFocus()

// Au clavier, la croix disparaît avec sa zone : le focus passe au volet qui reste, sinon à son onglet.
function close(event: MouseEvent) {
  layout.closeZone(props.zone)
  const view = layout.right.active
  if (event.detail !== 0 || !view) return
  dockFocus.focusView(view)
  nextTick(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    document.querySelector<HTMLElement>(`[data-dock-tab="${view}"][aria-selected="true"]`)?.focus()
  })
}
</script>

<template>
  <UiIconButton :label="t('dock.closeZone')" @click="close">
    <X class="size-3.5" aria-hidden="true" />
  </UiIconButton>
</template>
