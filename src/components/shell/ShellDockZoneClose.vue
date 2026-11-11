<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useDockClose } from '@/composables/useDockClose'
import { useDockFocus } from '@/composables/useDockFocus'
import { type DockView, type DockZone, useLayoutStore } from '@/stores/layout'

// Croix d'un volet. Panneau partagé : la zone disparaît, l'autre prend toute la place, le volet reste en onglet.
// Sinon elle ferme l'onglet affiché (page, groupe de shells ou volet).
const props = defineProps<{ zone: DockZone; view: DockView }>()

const { t } = useI18n()
const layout = useLayoutStore()
const dockFocus = useDockFocus()
const { close: closeTab, shownTab } = useDockClose()

// Au clavier, la croix disparaît avec sa zone : le focus passe au volet qui reste, sinon à son onglet.
async function close(event: MouseEvent) {
  if (layout.right.aside) layout.closeZone(props.zone)
  else await closeTab(shownTab(props.view))
  const view = layout.right.active
  if (event.detail !== 0) return
  if (!view) return dockFocus.focusComposer()
  dockFocus.focusView(view)
  nextTick(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    document.querySelector<HTMLElement>(`[data-dock-tab="${view}"][aria-selected="true"]`)?.focus()
  })
}
</script>

<template>
  <UiIconButton :label="t(layout.right.aside ? 'dock.closeZone' : 'dock.closeTab')" @click="close">
    <X class="size-3.5" aria-hidden="true" />
  </UiIconButton>
</template>
