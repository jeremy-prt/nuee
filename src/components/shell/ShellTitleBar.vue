<script setup lang="ts">
import { Columns2, LayoutList, PanelBottom, PanelRight, X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatIcon from '@/components/chat/ChatIcon.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useTabTitle } from '@/composables/useTabTitle'
import { isMacosApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { useAttentionStore } from '@/stores/attention'
import { useConversationsStore } from '@/stores/conversations'
import { useDragStore } from '@/stores/drag'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { parentDetail, settingsDetailTitle, useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const appearance = useAppearanceStore()
const attention = useAttentionStore()
const conversations = useConversationsStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const { startTabDrag } = useLayoutDrag()
const { tabTitle } = useTabTitle()

// Le bouton de la barre latérale reste juste après les boutons de fenêtre macOS (fin à 76 pt, `trafficLightPosition`),
// ouverte ou repliée, comme monocode (choix de Jérémy). Ces boutons ne suivent pas le zoom : leur place, en points,
// se convertit en px CSS.
const lights = computed(() => (isMacosApp() ? 88 / appearance.zoomFactor : 8))
// Le bouton fait 28 px, plus 8 px de marge.
const TOGGLE = 36

const menu = computed(() => appearance.layout === 'menu')
const railWidth = computed(() => (layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH))
const panelOpen = computed(() => !menu.value && navigation.hasPanel && layout.panel.open)

// La zone de gauche couvre la barre latérale (sa bordure monte si elle est plus large que les boutons), au moins
// jusqu'au bouton. La colonne qui touche la carte finit par une marge de 6 px, les autres par un trait de 1 px.
const railEdge = computed(() => (panelOpen.value ? 1 : 6))
const leftZone = computed(() => {
  const column = menu.value ? (layout.rail.expanded ? layout.rail.width + 6 : 0) : railWidth.value + railEdge.value
  return Math.max(column, lights.value + TOGGLE)
})
const railBorderUp = computed(() => !menu.value && panelOpen.value && leftZone.value === railWidth.value + 1)
const centerStart = computed(() => railWidth.value + railEdge.value + (panelOpen.value ? layout.panel.width + 6 : 0))
const spacer = computed(() => (menu.value ? 0 : Math.max(0, centerStart.value - leftZone.value)))
</script>

<template>
  <!-- Jamais moins de 40 pt de haut : les boutons macOS, fixes, doivent y tenir quel que soit le zoom. -->
  <header
    class="flex shrink-0 items-center bg-frame"
    :style="{ height: 'max(2.5rem, calc(2.5rem / var(--ui-zoom, 1)))' }"
    data-tauri-drag-region
  >
    <div
      class="flex shrink-0 items-center self-stretch"
      :class="{ 'border-e border-stroke': railBorderUp }"
      data-title-edge="rail"
      :style="{ width: `${leftZone}px`, paddingInlineStart: `${lights}px` }"
      data-tauri-drag-region
    >
      <ShellRailToggle />
    </div>
    <!-- Au-dessus du panneau latéral : son bouton de fermeture, calé sur son bord droit. -->
    <div
      v-if="!menu"
      class="flex shrink-0 items-center justify-end self-stretch pe-2"
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
        v-if="!menu && navigation.hasPanel && !layout.panel.open"
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
          <template v-if="parentDetail(navigation.settingsDetail)">
            <span class="shrink-0 text-muted/60" aria-hidden="true">/</span>
            <button
              type="button"
              class="min-w-0 truncate rounded text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
              @click="navigation.showSettingsDetail(parentDetail(navigation.settingsDetail))"
            >
              {{ settingsDetailTitle(parentDetail(navigation.settingsDetail)!, t) }}
            </button>
          </template>
          <span class="shrink-0 text-muted/60" aria-hidden="true">/</span>
          <span class="truncate" data-tauri-drag-region>{{ settingsDetailTitle(navigation.settingsDetail, t) }}</span>
        </template>
      </p>
      <template v-if="navigation.view === 'settings'">
        <span class="flex-1 self-stretch" data-tauri-drag-region />
        <SettingsSearch />
      </template>

      <template v-if="navigation.view === 'chats'">
        <div
          role="tablist"
          data-tab-strip
          :aria-label="t('workspace.tabs')"
          class="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
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
            <ChatSpinner v-if="conversations.working(tab.id)" :agent="tab.agent" class="size-3.5 text-xs" />
            <ChatIcon v-else class="size-3.5 shrink-0" />
            <span class="truncate">{{ tabTitle(tab) }}</span>
            <span v-if="attention.isUnseen(tab.id)" class="size-1.5 shrink-0 rounded-full bg-signal">
              <span class="sr-only">{{ t('attention.unseen') }}</span>
            </span>
            <UiTooltip :label="t('workspace.closeTab')" :shortcut="shortcuts.label('closeTab')">
              <button
                type="button"
                tabindex="-1"
                class="grid size-5 shrink-0 place-items-center rounded-md text-muted transition-opacity duration-(--hover-duration) group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-selection-inner hover:text-content motion-reduce:transition-none"
                :class="tab.id === workspace.activeTabId ? 'opacity-100' : 'opacity-0'"
                :aria-label="t('workspace.closeTab')"
                @click.stop="workspace.closeTab(tab.id)"
              >
                <X class="size-3" aria-hidden="true" />
              </button>
            </UiTooltip>
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
