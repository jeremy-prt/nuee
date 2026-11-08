<script setup lang="ts">
import { LayoutList, PanelRight, Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import ShellDockTabs from '@/components/shell/ShellDockTabs.vue'
import ShellEnvironment from '@/components/shell/ShellEnvironment.vue'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import ShellTab from '@/components/shell/ShellTab.vue'
import ShellTabs from '@/components/shell/ShellTabs.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useNewChat } from '@/composables/useNewChat'
import { isMacosApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { useBrowserStore } from '@/stores/browser'
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
const browser = useBrowserStore()
// Panneau fermé pendant que l'agent se sert du navigateur : une pastille sur son bouton.
const agentActs = computed(() => !!workspace.activeTabId && browser.agentActs(workspace.activeTabId))

// Le bouton de la barre latérale reste juste après les boutons de fenêtre macOS (fin à 76 pt, `trafficLightPosition`),
// ouverte ou repliée, comme monocode (choix de Jérémy). Ces boutons ne suivent pas le zoom : leur place, en points,
// se convertit en px CSS.
const lights = computed(() => (isMacosApp() ? 88 / appearance.zoomFactor : 8))
// Le bouton fait 28 px, plus 8 px de marge.
const TOGGLE = 36

const menu = computed(() => appearance.layout === 'menu')
const railWidth = computed(() => (layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH))
const panelOpen = computed(() => !menu.value && navigation.hasPanel && layout.panel.open)

// La zone de gauche couvre la barre latérale, au moins jusqu'au bouton. Chaque colonne finit par un trait de 1 px,
// qui s'arrête sous la barre de titre (choix de Jérémy).
const railShown = computed(() => !menu.value || layout.rail.expanded)
const leftZone = computed(() => Math.max(railShown.value ? railWidth.value + 1 : 0, lights.value + TOGGLE))
const centerStart = computed(() => railWidth.value + 1 + (panelOpen.value ? layout.panel.width + 1 : 0))
const spacer = computed(() => (menu.value ? 0 : Math.max(0, centerStart.value - leftZone.value)))
</script>

<template>
  <!-- Jamais moins de 40 pt de haut : les boutons macOS, fixes, doivent y tenir quel que soit le zoom. Pas de trait sous
       la barre (choix de Jérémy) : le centre trace le sien. -->
  <header
    class="flex shrink-0 items-center bg-chrome"
    :style="{ height: 'max(2.5rem, calc(2.5rem / var(--ui-zoom, 1)))' }"
    data-tauri-drag-region
  >
    <div
      class="flex shrink-0 items-center self-stretch"
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

    <div class="flex h-full min-w-0 flex-1 items-center gap-1 pe-2" data-tauri-drag-region>
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

      <!-- Hors des sessions, les onglets épinglés restent là (choix de Jérémy) : un clic ramène à la session. -->
      <div
        v-if="navigation.view !== 'chats' && navigation.view !== 'settings' && workspace.pinnedTabs.length"
        role="tablist"
        :aria-label="t('workspace.tabs')"
        class="flex h-full items-center gap-0.5"
        data-tauri-drag-region
      >
        <ShellTab v-for="tab in workspace.pinnedTabs" :key="tab.id" :tab="tab" :index="-1" :count="0" :rank="null" />
      </div>
      <template v-if="navigation.view === 'chats'">
        <ShellTabs />

        <UiIconButton :label="t('chats.newChat')" :shortcut="shortcuts.label('newChat')" class="ms-0.5" @click="newChat()">
          <Plus class="size-4" aria-hidden="true" />
        </UiIconButton>
        <span class="flex-1 self-stretch" data-tauri-drag-region />
        <!-- Comme Orca et l'app Claude : panneau ouvert, ses volets se choisissent au-dessus de lui, dans une zone calée
             sur sa largeur (poignée comprise) ; `-me-2` annule la marge de la barre ; le bouton qui l'ouvre reste tout à droite. -->
        <div
          class="-me-2 flex shrink-0 items-center gap-0.5 self-stretch pe-3.5"
          :class="{ 'ps-2': layout.right.open }"
          :style="layout.right.open ? { width: `${layout.right.size + 1}px` } : undefined"
          data-tauri-drag-region
        >
          <template v-if="layout.right.open">
            <!-- Comme T3 Code : les onglets des volets ouverts, puis un « + » pour en ouvrir d'autres. -->
            <ShellDockTabs class="min-w-0" />
            <span class="flex-1 self-stretch" data-tauri-drag-region />
          </template>
          <!-- Environnement n'est pas un volet : un panneau flottant, ouvert depuis ce bouton (choix de Jérémy). -->
          <ShellEnvironment />
          <UiIconButton
            :label="t('dock.toggle')"
            :shortcut="shortcuts.label('toggleRightDock')"
            :aria-expanded="layout.right.open"
            @click="layout.toggleRight()"
          >
            <span class="relative grid place-items-center">
              <PanelRight class="size-4" aria-hidden="true" />
              <span
                v-if="!layout.right.open && agentActs"
                class="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-signal ring-2 ring-chrome motion-safe:animate-pulse"
                aria-hidden="true"
              />
            </span>
          </UiIconButton>
        </div>
      </template>
    </div>
  </header>
</template>
