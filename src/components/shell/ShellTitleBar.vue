<script setup lang="ts">
import { Columns2, LayoutList, MessageSquare, PanelBottom, PanelRight, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useTabTitle } from '@/composables/useTabTitle'
import { isMacosApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { useAttentionStore } from '@/stores/attention'
import { useDragStore } from '@/stores/drag'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const appearance = useAppearanceStore()
const attention = useAttentionStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const { startTabDrag } = useLayoutDrag()
const { tabTitle } = useTabTitle()

// Boutons de fenêtre macOS (fin à 70 pt) plus une marge ; un bouton de la barre fait 28 px plus 8 px de marge.
// Ces boutons ne suivent pas le zoom de l'interface : leur place, en points, se convertit en px CSS.
const lights = computed(() => (isMacosApp() ? 84 / appearance.zoomFactor : 0))
const TOGGLE = 36

const railWidth = computed(() => (layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH))
const panelOpen = computed(() => navigation.hasPanel && layout.panel.open)

// Dépliée, la barre latérale a son bouton ici, au-dessus de son bord droit, et sa bordure monte.
// Repliée, elle est plus étroite que les boutons macOS : son bouton passe dans la colonne d'icônes.
// Chaque séparateur fait 1 px : la zone inclut celui de la barre latérale, l'espace celui du panneau.
const leftZone = computed(() => Math.max(railWidth.value + 1, lights.value))
const railBorderUp = computed(() => leftZone.value === railWidth.value + 1)
const centerStart = computed(() => railWidth.value + 1 + (panelOpen.value ? layout.panel.width + 1 : 0))
const spacer = computed(() => Math.max(0, centerStart.value - leftZone.value))
</script>

<template>
  <!-- Jamais moins de 40 pt de haut : les boutons macOS, fixes, doivent y tenir quel que soit le zoom. -->
  <header
    class="flex shrink-0 items-center border-b border-stroke bg-chrome"
    :style="{ height: 'max(2.5rem, calc(2.5rem / var(--ui-zoom, 1)))' }"
    data-tauri-drag-region
  >
    <div
      class="flex shrink-0 items-center justify-end self-stretch pe-2"
      :class="{ 'border-e border-stroke': railBorderUp }"
      :style="{ width: `${leftZone}px` }"
      data-tauri-drag-region
    >
      <ShellRailToggle v-if="layout.rail.expanded" />
    </div>
    <!-- Au-dessus du panneau latéral : son bouton de fermeture, calé sur son bord droit. -->
    <div
      class="flex shrink-0 items-center justify-end self-stretch pe-2"
      :class="{ 'border-e border-stroke': panelOpen && spacer > 0 }"
      :style="{ width: `${spacer}px` }"
      data-tauri-drag-region
    >
      <UiIconButton
        v-if="panelOpen && spacer >= TOGGLE"
        :label="t('chats.toggle')"
        :shortcut="shortcuts.label('togglePanel')"
        aria-controls="shell-panel"
        :aria-expanded="true"
        @click="layout.togglePanel()"
      >
        <LayoutList class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>

    <div class="flex h-full min-w-0 flex-1 items-center gap-1 ps-2 pe-2" data-tauri-drag-region>
      <UiIconButton
        v-if="navigation.hasPanel && !layout.panel.open"
        :label="t('chats.toggle')"
        :shortcut="shortcuts.label('togglePanel')"
        aria-controls="shell-panel"
        :aria-expanded="false"
        @click="layout.togglePanel()"
      >
        <LayoutList class="size-4" aria-hidden="true" />
      </UiIconButton>

      <p v-if="navigation.view === 'settings'" class="flex min-w-0 items-center gap-2 px-1 text-xs" data-tauri-drag-region>
        <span class="shrink-0 text-muted" data-tauri-drag-region>{{ t('rail.settings') }}</span>
        <span class="shrink-0 text-muted/60" aria-hidden="true">/</span>
        <button
          v-if="navigation.settingsDetail"
          type="button"
          class="shrink-0 rounded text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
          @click="navigation.showSettingsDetail(null)"
        >
          {{ t(`settings.sections.${navigation.settingsSection}`) }}
        </button>
        <span v-else class="truncate" data-tauri-drag-region>{{ t(`settings.sections.${navigation.settingsSection}`) }}</span>
        <template v-if="navigation.settingsDetail">
          <span class="shrink-0 text-muted/60" aria-hidden="true">/</span>
          <span class="truncate" data-tauri-drag-region>{{ t(navigation.settingsDetailKey) }}</span>
        </template>
      </p>

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
            class="group flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-md ps-2 pe-1 text-xs focus-visible:outline-2 focus-visible:outline-ring"
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
            <span v-if="attention.isUnseen(tab.id)" class="size-1.5 shrink-0 rounded-full bg-accent">
              <span class="sr-only">{{ t('attention.unseen') }}</span>
            </span>
            <button
              type="button"
              tabindex="-1"
              class="grid size-5 shrink-0 place-items-center rounded group-hover:opacity-100 hover:bg-selection-hover"
              :class="tab.id === workspace.activeTabId ? 'opacity-100' : 'opacity-0'"
              :aria-label="t('workspace.closeTab')"
              :title="shortcuts.label('closeTab') ? `${t('workspace.closeTab')} (${shortcuts.label('closeTab')})` : t('workspace.closeTab')"
              @click.stop="workspace.closeTab(tab.id)"
            >
              <X class="size-3" aria-hidden="true" />
            </button>
          </div>

        </div>

        <UiIconButton
          :label="t('workspace.split')"
          :shortcut="shortcuts.label('split')"
          :disabled="workspace.panes.length !== 1"
          @click="workspace.split()"
        >
          <Columns2 class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          v-if="layout.viewsIn('bottom').length"
          :label="t('dock.toggleBottom')"
          :shortcut="shortcuts.label('toggleBottomDock')"
          :active="layout.bottom.open"
          :aria-expanded="layout.bottom.open"
          @click="layout.toggleDock('bottom')"
        >
          <PanelBottom class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          v-if="layout.viewsIn('right').length"
          :label="t('dock.toggleRight')"
          :shortcut="shortcuts.label('toggleRightDock')"
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
