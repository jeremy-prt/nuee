<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import ShellDockMenu from '@/components/shell/ShellDockMenu.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useLayoutStore } from '@/stores/layout'

// Onglets du panneau de droite, comme Devin : les volets ouverts s'ajoutent à côté du « + » pour passer de l'un à
// l'autre ; seul l'actif montre son nom (et sa croix), les autres leur icône, pour tenir dans un panneau étroit. Environnement (Session) reste toujours, en premier. Au clavier, Suppr ferme l'onglet qui a le focus.
const { t } = useI18n()
const layout = useLayoutStore()
</script>

<template>
  <div class="flex min-w-0 items-center gap-0.5" role="tablist" :aria-label="t('dock.right')">
    <UiTooltip v-for="view in layout.right.tabs" :key="view" :label="t(`dock.${view}.title`)" :disabled="layout.right.active === view">
      <div
        class="group relative flex h-7 min-w-0 items-center rounded-md text-xs"
        :class="layout.right.active === view ? 'shrink bg-selection text-content' : 'shrink-0 text-muted hover:bg-selection-hover hover:text-content'"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="layout.right.active === view"
          :aria-label="t(`dock.${view}.title`)"
          class="flex h-full min-w-0 items-center gap-1.5 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-ring"
          :class="{ 'pe-6': layout.right.active === view && view !== 'session' }"
          @click="layout.showView(view)"
          @auxclick.middle="layout.closeView(view)"
          @keydown.delete="layout.closeView(view)"
          @keydown.backspace="layout.closeView(view)"
        >
          <component :is="dockIcons[view]" class="size-3.5 shrink-0" aria-hidden="true" />
          <span v-if="layout.right.active === view" class="truncate">{{ t(`dock.${view}.title`) }}</span>
        </button>
        <button
          v-if="layout.right.active === view && view !== 'session'"
          type="button"
          tabindex="-1"
          class="absolute end-1 grid size-5 place-items-center rounded-md text-muted hover:bg-selection-inner hover:text-content"
          :aria-label="t('dock.closeTab')"
          :title="t('dock.closeTab')"
          @click="layout.closeView(view)"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>
    </UiTooltip>
    <ShellDockMenu class="ms-0.5" />
  </div>
</template>
