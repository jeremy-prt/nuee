<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDock from '@/components/shell/ShellDock.vue'
import ShellRail from '@/components/shell/ShellRail.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import ShellSidePanel from '@/components/shell/ShellSidePanel.vue'
import ShellTitleBar from '@/components/shell/ShellTitleBar.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useAppearanceStore } from '@/stores/appearance'
import { useDragStore } from '@/stores/drag'
import { SIZES, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'
import { matchesShortcut, type Shortcut, shortcuts } from '@/utils/shortcuts'
import HomeView from '@/views/HomeView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'
import SearchView from '@/views/SearchView.vue'
import SettingsView from '@/views/SettingsView.vue'
import UpdatesView from '@/views/UpdatesView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'

// ===== Initialisation =====
const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const newChat = useNewChat()
// Pose le style de fenêtre sur <html> dès le démarrage, pas seulement à l'ouverture des réglages.
useAppearanceStore()

const inChats = computed(() => navigation.view === 'chats')
const showBottomDock = computed(() => layout.bottom.open && layout.viewsIn('bottom').length > 0)
const showRightDock = computed(() => layout.right.open && layout.viewsIn('right').length > 0)

// Raccourcis propres aux chats : sans effet sur les autres vues.
function inChatsOnly(action: () => void) {
  return () => {
    if (inChats.value) action()
  }
}

function togglePanel() {
  if (navigation.hasPanel) layout.togglePanel()
}

const actions: [Shortcut, () => void][] = [
  [shortcuts.toggleRail, layout.toggleRail],
  [shortcuts.newChat, () => newChat()],
  [shortcuts.search, () => navigation.go('search')],
  [shortcuts.togglePanel, togglePanel],
  [shortcuts.toggleRightDock, inChatsOnly(() => layout.toggleDock('right'))],
  [shortcuts.toggleBottomDock, inChatsOnly(() => layout.toggleDock('bottom'))],
  [shortcuts.closeTab, inChatsOnly(workspace.closeActiveTab)],
  [shortcuts.split, inChatsOnly(workspace.split)],
]

function onKeydown(event: KeyboardEvent) {
  const action = actions.find(([shortcut]) => matchesShortcut(event, shortcut))
  if (!action) return
  event.preventDefault()
  action[1]()
}

// Fondu à l'entrée et à la sortie des réglages, comme Brume. Le contenu seul : sur macOS, un fond
// qui s'efface laisserait voir le bureau à travers la fenêtre transparente.
const FADED = '#shell-rail > *, #view-area > *, #workspace-area > *'

watch(
  () => navigation.view === 'settings',
  async () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    await nextTick()
    for (const element of document.querySelectorAll(FADED)) {
      element.animate({ opacity: [0, 1] }, { duration: 280, easing: 'ease-out' })
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <TooltipProvider :delay-duration="400" :skip-delay-duration="300">
    <h1 class="sr-only">Nuée</h1>
    <div class="flex h-full flex-col">
      <ShellTitleBar />
      <div class="flex min-h-0 flex-1">
        <ShellRail />
        <ShellResizeHandle
          v-if="layout.rail.expanded"
          v-model="layout.rail.width"
          v-bind="SIZES.rail"
          orientation="vertical"
          :label="t('rail.resize')"
        />
        <div v-else class="separator w-px shrink-0" />

        <template v-if="navigation.hasPanel && layout.panel.open">
          <ShellSidePanel :style="{ width: `${layout.panel.width}px` }" />
          <ShellResizeHandle
            v-model="layout.panel.width"
            v-bind="SIZES.panel"
            orientation="vertical"
            :label="t('chats.resize')"
          />
        </template>

        <div
          v-if="navigation.view === 'chats'"
          id="workspace-area"
          class="flex min-w-0 flex-1"
        >
          <div id="workspace-column" class="flex min-w-0 flex-1 flex-col">
            <!-- Seul le chat prend le fond de la zone centrale : terminal et panneau de droite font partie du cadre. -->
            <main class="min-h-0 flex-1 bg-surface">
              <WorkspaceView />
            </main>
            <template v-if="showBottomDock">
              <ShellResizeHandle
                v-model="layout.bottom.size"
                v-bind="SIZES.bottom"
                orientation="horizontal"
                invert
                :label="t('dock.resize')"
              />
              <ShellDock position="bottom" :style="{ height: `${layout.bottom.size}px` }" />
            </template>
          </div>
          <template v-if="showRightDock">
            <ShellResizeHandle
              v-model="layout.right.size"
              v-bind="SIZES.right"
              orientation="vertical"
              invert
              :label="t('dock.resize')"
            />
            <ShellDock position="right" :style="{ width: `${layout.right.size}px` }" />
          </template>
        </div>

        <main v-else id="view-area" class="min-w-0 flex-1 bg-surface">
          <HomeView v-if="navigation.view === 'home'" />
          <SearchView v-else-if="navigation.view === 'search'" />
          <UpdatesView v-else-if="navigation.view === 'updates'" />
          <SettingsView v-else-if="navigation.view === 'settings'" />
          <PlaceholderView v-else :view="navigation.view" />
        </main>
      </div>
    </div>

    <div
      v-if="drag.preview"
      class="pointer-events-none fixed z-50 rounded-lg border-2 border-accent/60 bg-accent/15 transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{
        left: `${drag.preview.left + 4}px`,
        top: `${drag.preview.top + 4}px`,
        width: `${drag.preview.width - 8}px`,
        height: `${drag.preview.height - 8}px`,
      }"
      aria-hidden="true"
    />
  </TooltipProvider>
</template>
