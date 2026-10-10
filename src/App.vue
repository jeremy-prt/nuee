<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellBackground from '@/components/shell/ShellBackground.vue'
import ShellDock from '@/components/shell/ShellDock.vue'
import ShellRail from '@/components/shell/ShellRail.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import ShellSidePanel from '@/components/shell/ShellSidePanel.vue'
import ShellTitleBar from '@/components/shell/ShellTitleBar.vue'
import UiConfirmDialog from '@/components/ui/UiConfirmDialog.vue'
import UiToasts from '@/components/ui/UiToasts.vue'
import { useNewChat } from '@/composables/useNewChat'
import { appQuit, onQuitRequested } from '@/ipc/app'
import { isTauriApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { useAttentionStore } from '@/stores/attention'
import { useDialogStore } from '@/stores/dialog'
import { useDragStore } from '@/stores/drag'
import { useGeneralStore } from '@/stores/general'
import { SIZES, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUpdatesStore } from '@/stores/updates'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ShortcutId } from '@/utils/shortcuts'
import HomeView from '@/views/HomeView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'
import SearchView from '@/views/SearchView.vue'
import SettingsView from '@/views/SettingsView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'

// ===== Initialisation =====
const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const newChat = useNewChat()
const shortcuts = useShortcutsStore()
// Pose le style de fenêtre sur <html> dès le démarrage, pas seulement à l'ouverture des réglages.
const appearance = useAppearanceStore()
// Langue choisie et mise en veille : appliquées avant le premier rendu.
const general = useGeneralStore()
const dialog = useDialogStore()
// Suit le focus de la fenêtre dès le lancement : un chat qui finit doit savoir s'il est vu.
useAttentionStore()

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

const actions: [ShortcutId, () => void][] = [
  ['toggleRail', layout.toggleRail],
  ['newChat', () => newChat()],
  ['search', () => navigation.go('search')],
  ['togglePanel', togglePanel],
  ['toggleRightDock', inChatsOnly(() => layout.toggleDock('right'))],
  ['toggleBottomDock', inChatsOnly(() => layout.toggleDock('bottom'))],
  ['closeTab', inChatsOnly(workspace.closeActiveTab)],
  ['split', inChatsOnly(workspace.split)],
  ['settings', () => navigation.go('settings')],
  ['zoomIn', () => appearance.stepZoom(1)],
  ['zoomOut', () => appearance.stepZoom(-1)],
  ['zoomReset', () => (appearance.zoom = 100)],
]

function onKeydown(event: KeyboardEvent) {
  const action = actions.find(([id]) => shortcuts.matches(event, id))
  if (!action) return
  event.preventDefault()
  action[1]()
}

// Rust ne demande que si un agent travaille encore ; un second ⌘Q pendant la question est ignoré.
let askingQuit = false
async function confirmQuit(busy: number) {
  if (askingQuit) return
  askingQuit = true
  const confirmed = await dialog.confirm({
    title: t('quit.title'),
    message: t('quit.message', busy),
    confirmLabel: t('quit.confirm'),
  })
  askingQuit = false
  if (confirmed) appQuit()
}

let stopQuitListener: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (!isTauriApp()) return
  onQuitRequested(confirmQuit).then((stop) => (stopQuitListener = stop))
  if (general.checkUpdates) useUpdatesStore().checkOnLaunch()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopQuitListener?.()
})
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
            <main class="relative isolate min-h-0 flex-1 bg-surface">
              <ShellBackground />
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

        <main v-else id="view-area" class="relative isolate min-w-0 flex-1 bg-surface">
          <ShellBackground />
          <HomeView v-if="navigation.view === 'home'" />
          <SearchView v-else-if="navigation.view === 'search'" />
          <SettingsView v-else-if="navigation.view === 'settings'" />
          <PlaceholderView v-else :view="navigation.view" />
        </main>
      </div>
    </div>

    <div
      v-if="drag.preview"
      class="pointer-events-none fixed z-50 rounded-lg border-2 border-ring bg-accent/15 transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{
        left: `${drag.preview.left + 4}px`,
        top: `${drag.preview.top + 4}px`,
        width: `${drag.preview.width - 8}px`,
        height: `${drag.preview.height - 8}px`,
      }"
      aria-hidden="true"
    />
    <UiConfirmDialog />
    <UiToasts />
  </TooltipProvider>
</template>
