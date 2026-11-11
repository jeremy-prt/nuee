<script setup lang="ts">
import { PanelRight, Plus } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { dockIcons } from '@/components/shell/dockIcons'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useDockOpener } from '@/composables/useDockOpener'
import { DOCK_VIEWS, type DockView, useLayoutStore } from '@/stores/layout'

// « + » au-dessus du panneau de droite : ouvre un volet ou y ramène ; le navigateur reçoit un onglet de plus. Le bouton
// au bout d'une ligne l'ouvre à côté du volet affiché. C'est un second élément du menu, pas un bouton dans le premier :
// les flèches l'atteignent juste après sa ligne.
const { t } = useI18n()
const layout = useLayoutStore()
const open = useDockOpener()

const canOpenAside = (view: DockView) => !!layout.right.active && view !== layout.right.active && view !== layout.right.aside

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
</script>

<template>
  <UiTooltip :label="t('dock.add')">
    <span class="flex">
      <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger
          class="grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="t('dock.add')"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <Plus class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="start" :side-offset="4" :collision-padding="8" :class="[menuPanel, 'w-52']" @close-auto-focus="onCloseAutoFocus">
            <div v-for="view in DOCK_VIEWS" :key="view" class="group/row relative flex flex-col">
              <UiMenuItem
                :label="t(`dock.${view}.title`)"
                :icon="dockIcons[view]"
                :class="{ 'pe-9 group-hover/row:bg-selection-hover group-has-[[data-aside][data-highlighted]]/row:bg-selection-hover': canOpenAside(view) }"
                @select="open(view)"
              />
              <UiTooltip v-if="canOpenAside(view)" :label="t('dock.openAside')" side="top">
                <DropdownMenuItem
                  data-aside
                  text-value=""
                  :aria-label="t('dock.openAsideView', { view: t(`dock.${view}.title`) })"
                  class="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted opacity-0 outline-none group-hover/row:opacity-100 group-has-[[data-highlighted]]/row:opacity-100 data-[highlighted]:bg-selection-inner data-[highlighted]:text-content"
                  @select="layout.showAside(view)"
                >
                  <PanelRight class="size-4" aria-hidden="true" />
                </DropdownMenuItem>
              </UiTooltip>
            </div>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
