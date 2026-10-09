<script setup lang="ts">
import { Columns2, LayoutList, MessageSquare, PanelBottom, PanelRight, Plus, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useNewChat } from '@/composables/useNewChat'
import { useTabTitle } from '@/composables/useTabTitle'
import { isMacosApp } from '@/ipc/system'
import { useDragStore } from '@/stores/drag'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const { startTabDrag } = useLayoutDrag()
const { tabTitle } = useTabTitle()
const newChat = useNewChat()

// Place des boutons de fenêtre macOS (fin à 70 px) plus une marge.
const MIN_LEFT_ZONE = isMacosApp() ? 84 : 0
const railWidth = computed(() => (layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH))
const panelOpen = computed(() => navigation.hasPanel && layout.panel.open)

// Les bordures verticales montent dans la barre de titre tant qu'elles ne croisent pas les boutons macOS.
// Chaque séparateur fait 1 px : la zone inclut celui de la barre latérale, l'espace celui du panneau.
const railBorderUp = computed(() => railWidth.value >= MIN_LEFT_ZONE)
const leftZone = computed(() => (railBorderUp.value ? railWidth.value + 1 : MIN_LEFT_ZONE))
const centerStart = computed(() => railWidth.value + 1 + (panelOpen.value ? layout.panel.width + 1 : 0))
const spacer = computed(() => Math.max(0, centerStart.value - leftZone.value))
</script>

<template>
  <header
    class="flex h-10 shrink-0 items-center border-b border-stroke bg-canvas macos:bg-canvas/40"
    data-tauri-drag-region
  >
    <div
      class="shrink-0 self-stretch"
      :class="{ 'border-e border-stroke': railBorderUp }"
      :style="{ width: `${leftZone}px` }"
      data-tauri-drag-region
    />
    <div
      class="shrink-0 self-stretch"
      :class="{ 'border-e border-stroke': panelOpen && spacer > 0 }"
      :style="{ width: `${spacer}px` }"
      data-tauri-drag-region
    />

    <div class="flex h-full min-w-0 flex-1 items-center gap-1 ps-2 pe-2" data-tauri-drag-region>
      <UiIconButton
        v-if="navigation.hasPanel && !layout.panel.open"
        :label="t('chats.toggle')"
        :shortcut="shortcutLabel(shortcuts.togglePanel)"
        aria-controls="shell-panel"
        :aria-expanded="false"
        @click="layout.togglePanel()"
      >
        <LayoutList class="size-4" aria-hidden="true" />
      </UiIconButton>

      <template v-if="navigation.view === 'chats'">
        <div
          role="tablist"
          data-tab-strip
          :aria-label="t('workspace.tabs')"
          class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          data-tauri-drag-region
        >
          <div
            v-for="tab in workspace.contextTabs"
            :key="tab.id"
            role="tab"
            tabindex="0"
            :data-tab-id="tab.id"
            :aria-selected="tab.id === workspace.activeTabId"
            class="group flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-md ps-2 pe-1 text-xs focus-visible:outline-2 focus-visible:outline-accent"
            :class="[
              tab.id === workspace.activeTabId
                ? 'bg-selection text-content'
                : 'text-muted hover:bg-selection-hover hover:text-content',
              { 'opacity-50': drag.source?.kind === 'tab' && drag.source.id === tab.id },
            ]"
            @pointerdown="startTabDrag($event, tab.id)"
            @click="workspace.show(tab.id)"
            @keydown.enter.prevent="workspace.show(tab.id)"
            @keydown.space.prevent="workspace.show(tab.id)"
            @auxclick.middle="workspace.closeTab(tab.id)"
          >
            <MessageSquare class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ tabTitle(tab) }}</span>
            <button
              type="button"
              tabindex="-1"
              class="grid size-5 shrink-0 place-items-center rounded group-hover:opacity-100 hover:bg-selection-hover"
              :class="tab.id === workspace.activeTabId ? 'opacity-100' : 'opacity-0'"
              :aria-label="t('workspace.closeTab')"
              :title="`${t('workspace.closeTab')} (${shortcutLabel(shortcuts.closeTab)})`"
              @click.stop="workspace.closeTab(tab.id)"
            >
              <X class="size-3" aria-hidden="true" />
            </button>
          </div>

          <UiIconButton :label="t('chats.newChat')" :shortcut="shortcutLabel(shortcuts.newChat)" @click="newChat()">
            <Plus class="size-4" aria-hidden="true" />
          </UiIconButton>
        </div>

        <UiIconButton
          :label="t('workspace.split')"
          :shortcut="shortcutLabel(shortcuts.split)"
          :disabled="workspace.panes.length !== 1"
          @click="workspace.split()"
        >
          <Columns2 class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          v-if="layout.viewsIn('bottom').length"
          :label="t('dock.toggleBottom')"
          :shortcut="shortcutLabel(shortcuts.toggleBottomDock)"
          :active="layout.bottom.open"
          :aria-expanded="layout.bottom.open"
          @click="layout.toggleDock('bottom')"
        >
          <PanelBottom class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          v-if="layout.viewsIn('right').length"
          :label="t('dock.toggleRight')"
          :shortcut="shortcutLabel(shortcuts.toggleRightDock)"
          :active="layout.right.open"
          :aria-expanded="layout.right.open"
          @click="layout.toggleDock('right')"
        >
          <PanelRight class="size-4" aria-hidden="true" />
        </UiIconButton>
      </template>
    </div>
  </header>
</template>
