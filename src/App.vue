<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSkillPanel from '@/components/settings/SettingsSkillPanel.vue'
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
import { useAgentsStore } from '@/stores/agents'
import { useAppearanceStore } from '@/stores/appearance'
import { useAttentionStore } from '@/stores/attention'
import { useDialogStore } from '@/stores/dialog'
import { useDragStore } from '@/stores/drag'
import { useGeneralStore } from '@/stores/general'
import { SIZES, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useSkillsStore } from '@/stores/skills'
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
// Cherche les agents installés dès le lancement, pas à l'ouverture des réglages.
useAgentsStore()

const inChats = computed(() => navigation.view === 'chats')
// « Projets en menu » : pas de panneau latéral, les sessions sont dans la barre latérale ; le centre est une carte.
const menu = computed(() => appearance.layout === 'menu')
const panelShown = computed(() => !menu.value && navigation.hasPanel && layout.panel.open)
const showBottomDock = computed(() => layout.bottom.open && layout.viewsIn('bottom').length > 0)
const showRightDock = computed(() => layout.right.open && layout.viewsIn('right').length > 0)
const skills = useSkillsStore()
// Hors des chats, le panneau de droite ne sert qu'à l'aperçu d'un skill dans les réglages.
const previewedSkill = computed(() => (navigation.view === 'settings' ? skills.previewed : null))

// Raccourcis propres aux chats : sans effet sur les autres vues.
function inChatsOnly(action: () => void) {
  return () => {
    if (inChats.value) action()
  }
}

function togglePanel() {
  if (navigation.hasPanel && !menu.value) layout.togglePanel()
}

// La liste des projets est en haut de la barre latérale : elle s'ouvre au besoin.
function openSwitcher() {
  if (!menu.value) return
  layout.rail.expanded = true
  if (navigation.view === 'settings') navigation.closeSettings()
  navigation.switcherOpen = true
}

// La ligne de la session doit être visible pour s'éditer : le panneau ou la barre latérale s'ouvre au besoin.
function renameActive() {
  if (menu.value) layout.rail.expanded = true
  else layout.panel.open = true
  workspace.requestRename()
}

const actions: [ShortcutId, () => void][] = [
  ['toggleRail', layout.toggleRail],
  ['newChat', () => newChat()],
  ['search', () => navigation.go('search')],
  ['switchProject', openSwitcher],
  ['previousProject', () => navigation.stepProject(-1)],
  ['nextProject', () => navigation.stepProject(1)],
  ['togglePanel', togglePanel],
  ['toggleRightDock', inChatsOnly(() => layout.toggleDock('right'))],
  ['toggleBottomDock', inChatsOnly(() => layout.toggleDock('bottom'))],
  ['closeTab', inChatsOnly(workspace.closeActiveTab)],
  ['split', inChatsOnly(workspace.split)],
  ['rename', inChatsOnly(renameActive)],
  ['settings', () => navigation.go('settings')],
  ['zoomIn', () => appearance.stepZoom(1)],
  ['zoomOut', () => appearance.stepZoom(-1)],
  ['zoomReset', appearance.resetZoom],
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
  <!-- Délai proche de celui de macOS ; en passant aussitôt à un bouton voisin, son infobulle vient tout de suite. -->
  <TooltipProvider :delay-duration="1000" :skip-delay-duration="400">
    <h1 class="sr-only">Nuée</h1>
    <div class="flex h-full flex-col">
      <ShellTitleBar />
      <div class="flex min-h-0 flex-1">
        <template v-if="menu">
          <template v-if="layout.rail.expanded">
            <ShellRail />
            <ShellResizeHandle
              v-model="layout.rail.width"
              v-bind="SIZES.rail"
              orientation="vertical"
              ghost
              :label="t('rail.resize')"
            />
          </template>
        </template>
        <!-- La colonne qui touche la carte finit par une marge de 6 px sans trait, comme en « Projets en menu ». -->
        <template v-else>
          <ShellRail />
          <ShellResizeHandle
            v-if="layout.rail.expanded"
            v-model="layout.rail.width"
            :data-edge="panelShown ? 'rail' : undefined"
            v-bind="SIZES.rail"
            orientation="vertical"
            :ghost="!panelShown"
            :label="t('rail.resize')"
          />
          <div v-else class="shrink-0" :class="panelShown ? 'separator w-px' : 'w-1.5 bg-frame'" />
        </template>

        <template v-if="panelShown">
          <ShellSidePanel :style="{ width: `${layout.panel.width}px` }" />
          <ShellResizeHandle
            v-model="layout.panel.width"
            v-bind="SIZES.panel"
            orientation="vertical"
            ghost
            :label="t('chats.resize')"
          />
        </template>

        <!-- Centre en carte : son ombre pleine peint le cadre autour d'elle, que l'enveloppe coupe.
             Un fond sous la carte s'ajouterait au sien et changerait sa transparence. Le trait est un calque posé
             sur le contenu : une vraie bordure n'aurait rien dessous et laisserait voir le bureau, trop clair. -->
        <div class="flex min-w-0 flex-1 overflow-hidden pe-1.5 pb-1.5" :class="{ 'ps-1.5': menu && !layout.rail.expanded }">
          <div
            class="relative flex min-w-0 flex-1 overflow-hidden rounded-[10px] shadow-[0_0_0_100vmax_var(--color-frame)] after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[10px] after:border after:border-content/10"
          >
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
            <template v-if="previewedSkill">
              <ShellResizeHandle
                v-model="layout.right.size"
                v-bind="SIZES.right"
                orientation="vertical"
                invert
                :label="t('dock.resize')"
              />
              <SettingsSkillPanel :skill="previewedSkill" :style="{ width: `${layout.right.size}px` }" />
            </template>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="drag.preview?.line"
      class="pointer-events-none fixed z-50 h-0.5 -translate-y-1/2 rounded-full bg-ring transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{ left: `${drag.preview.left + 4}px`, top: `${drag.preview.top}px`, width: `${drag.preview.width - 8}px` }"
      aria-hidden="true"
    />
    <div
      v-else-if="drag.preview"
      class="pointer-events-none fixed z-50 rounded-lg border-2 border-ring bg-signal/15 transition-all duration-100 ease-out motion-reduce:transition-none"
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
