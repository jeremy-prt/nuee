<script setup lang="ts">
import { LayoutList, PanelRight, Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import ShellDockMenu from '@/components/shell/ShellDockMenu.vue'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import ShellTabs from '@/components/shell/ShellTabs.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useNewChat } from '@/composables/useNewChat'
import { isMacosApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { parentDetail, settingsDetailTitle, useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const appearance = useAppearanceStore()
const workspace = useWorkspaceStore()
const newChat = useNewChat()

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
// jusqu'au bouton. Chaque colonne finit par un trait de 1 px.
const railShown = computed(() => !menu.value || layout.rail.expanded)
const leftZone = computed(() => Math.max(railShown.value ? railWidth.value + 1 : 0, lights.value + TOGGLE))
const railBorderUp = computed(() => railShown.value && leftZone.value === railWidth.value + 1)
const centerStart = computed(() => railWidth.value + 1 + (panelOpen.value ? layout.panel.width + 1 : 0))
const spacer = computed(() => (menu.value ? 0 : Math.max(0, centerStart.value - leftZone.value)))
</script>

<template>
  <!-- Jamais moins de 40 pt de haut : les boutons macOS, fixes, doivent y tenir quel que soit le zoom. Pas de trait sous
       la barre latérale (choix de Jérémy) : seules les zones à sa droite en portent un. -->
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
      class="flex shrink-0 items-center justify-end self-stretch border-b border-stroke pe-2"
      :class="{ 'border-e border-stroke': panelOpen && spacer > 0 }"
      data-title-edge="panel"
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

    <div class="flex h-full min-w-0 flex-1 items-center gap-1 border-b border-stroke ps-2 pe-2" data-tauri-drag-region>
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
        <ShellTabs />

        <UiIconButton :label="t('chats.newChat')" :shortcut="shortcuts.label('newChat')" class="ms-0.5" @click="newChat()">
          <Plus class="size-4" aria-hidden="true" />
        </UiIconButton>
        <span class="flex-1 self-stretch" data-tauri-drag-region />
        <!-- Comme Orca et l'app Claude : panneau ouvert, ses volets se choisissent au-dessus de lui, dans une zone calée
             sur sa largeur (poignée comprise), son bord continue celui du panneau ; `-me-2` annule la marge de la barre ; le bouton qui l'ouvre reste tout à droite. -->
        <div
          class="-me-2 flex shrink-0 items-center gap-0.5 self-stretch pe-3.5"
          :class="{ 'border-s border-stroke ps-2': layout.right.open }"
          data-title-edge="right"
          :style="layout.right.open ? { width: `${layout.right.size + 1}px` } : undefined"
          data-tauri-drag-region
        >
          <template v-if="layout.right.open">
            <!-- Comme Devin : un « + » ouvre la liste des volets, au lieu d'une icône par volet. -->
            <ShellDockMenu />
            <span class="flex-1 self-stretch" data-tauri-drag-region />
          </template>
          <UiIconButton
            :label="t('dock.toggle')"
            :shortcut="shortcuts.label('toggleRightDock')"
            :aria-expanded="layout.right.open"
            @click="layout.toggleRight()"
          >
            <PanelRight class="size-4" aria-hidden="true" />
          </UiIconButton>
        </div>
      </template>
    </div>
  </header>
</template>
