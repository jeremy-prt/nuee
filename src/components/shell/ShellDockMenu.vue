<script setup lang="ts">
import { Plus } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { dockIcons } from '@/components/shell/dockIcons'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useDockOpener } from '@/composables/useDockOpener'
import { DOCK_VIEWS } from '@/stores/layout'
import { useShortcutsStore } from '@/stores/shortcuts'

// « + » au-dessus du panneau de droite : ouvre un volet ou y ramène ; le navigateur reçoit un onglet de plus.
const { t } = useI18n()
const shortcuts = useShortcutsStore()
const open = useDockOpener()

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
            <UiMenuItem
              v-for="view in DOCK_VIEWS"
              :key="view"
              :label="t(`dock.${view}.title`)"
              :icon="dockIcons[view]"
              :shortcut="view === 'terminal' ? shortcuts.label('toggleTerminal') : view === 'browser' ? shortcuts.label('toggleBrowser') : undefined"
              @select="open(view)"
            />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
