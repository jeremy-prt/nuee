<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSkillPanel from '@/components/settings/SettingsSkillPanel.vue'
import ShellBackground from '@/components/shell/ShellBackground.vue'
import ShellDockSplit from '@/components/shell/ShellDockSplit.vue'
import ShellRail from '@/components/shell/ShellRail.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import ShellSidePanel from '@/components/shell/ShellSidePanel.vue'
import ShellTitleBar from '@/components/shell/ShellTitleBar.vue'
import UiConfirmDialog from '@/components/ui/UiConfirmDialog.vue'
import UiToasts from '@/components/ui/UiToasts.vue'
import AgentUpdateNotice from '@/components/agent/AgentUpdateNotice.vue'
import { useDockClose } from '@/composables/useDockClose'
import { useDockFocus } from '@/composables/useDockFocus'
import { useColumnSlide } from '@/composables/useColumnSlide'
import { useNewChat } from '@/composables/useNewChat'
import { appQuit, onQuitRequested } from '@/ipc/app'
import { isTauriApp } from '@/ipc/system'
import { useAgentsStore } from '@/stores/agents'
import { useAppearanceStore } from '@/stores/appearance'
import { useAttentionStore } from '@/stores/attention'
import { useBrowserStore } from '@/stores/browser'
import { useDialogStore } from '@/stores/dialog'
import { useDragStore } from '@/stores/drag'
import { useGeneralStore } from '@/stores/general'
import { SIZES, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useOperatorStore } from '@/stores/operator'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useSkillsStore } from '@/stores/skills'
import { useUpdatesStore } from '@/stores/updates'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ShortcutId } from '@/utils/shortcuts'
import NewWorkspaceView from '@/views/NewWorkspaceView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'
import SearchView from '@/views/SearchView.vue'
import SettingsView from '@/views/SettingsView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'

// ===== Initialisation =====
const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
// Le panneau de droite garde la disposition du projet et montre les onglets de la session affichée, ouvert ou fermé
// comme elle l'a laissé ; chaque changement s'enregistre.
watch(
  () => workspace.activeTabId,
  (id) => {
    if (!id) return
    const tab = workspace.tabs.find((item) => item.id === id)
    const projectId = tab?.projectId ?? navigation.projectId
    layout.restore(id, projectId, workspace.tabsFor(projectId).map((item) => item.id), !!tab && !tab.started)
  },
  { immediate: true },
)
watch(
  () => [layout.right.open, layout.right.active, layout.right.aside, layout.right.asideRatio, [...layout.right.tabs]],
  () => {
    if (workspace.activeTabId) layout.remember(workspace.activeTabId)
  },
)
const drag = useDragStore()
const newTab = useNewChat('tab')
const shortcuts = useShortcutsStore()
const dockFocus = useDockFocus()
const dockClose = useDockClose()
// Branché dès le lancement : les onglets ouverts par l'agent arrivent même volet fermé.
const browser = useBrowserStore()
// Pose le style de fenêtre sur <html> dès le démarrage, pas seulement à l'ouverture des réglages.
const appearance = useAppearanceStore()
// Langue choisie et mise en veille : appliquées avant le premier rendu.
const general = useGeneralStore()
const dialog = useDialogStore()
// Suit le focus de la fenêtre dès le lancement : un chat qui finit doit savoir s'il est vu.
useAttentionStore()
// Outils de sessions des agents (serveur MCP `nuee`) : leur écouteur doit exister dès le lancement.
useOperatorStore()
// Cherche les agents installés dès le lancement, pas à l'ouverture des réglages.
useAgentsStore()

const inChats = computed(() => navigation.view === 'chats')
// Montées à la première visite puis gardées : revenir des réglages ne reconstruit pas chaque chat.
const chatsVisited = ref(false)
watch(inChats, (now) => now && (chatsVisited.value = true), { immediate: true })
// « Projets en menu » : pas de panneau latéral, les sessions sont dans la barre latérale ; le centre est une carte.
const menu = computed(() => appearance.layout === 'menu')
const panelShown = computed(() => !menu.value && navigation.hasPanel && layout.panel.open)
const showRightDock = computed(() => layout.right.open)
// Une colonne qui se ferme reste affichée le temps de glisser.
const dockShown = computed(() => showRightDock.value || layout.moving.dock)
useColumnSlide()
const skills = useSkillsStore()
// Hors des chats, le panneau de droite ne sert qu'à l'aperçu d'un skill dans les réglages.
const previewedSkill = computed(() => (navigation.view === 'settings' ? skills.previewed : null))
// Une colonne borde le centre à gauche (barre latérale ou panneau).
const columnAtStart = computed(() => !menu.value || layout.rail.expanded || layout.moving.rail)

// Raccourcis propres aux chats : sans effet sur les autres vues.
function inChatsOnly(action: () => void) {
  return () => {
    if (inChats.value) action()
  }
}

// ⌘L : le volet Navigateur s'ouvre au besoin, son adresse est sélectionnée.
function browserAddress() {
  layout.showView('browser')
  browser.focusAddress++
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

const actions: [ShortcutId, (event: KeyboardEvent) => void][] = [
  ['toggleRail', layout.toggleRail],
  // ⌘N mène à « Nouvel espace de travail », où l'on choisit projet et dossier ; ⌘T ouvre un onglet dans le projet affiché.
  ['newChat', () => navigation.go('new')],
  ['search', () => navigation.go('search')],
  ['switchProject', openSwitcher],
  ['previousProject', () => navigation.stepProject(-1)],
  ['nextProject', () => navigation.stepProject(1)],
  ['togglePanel', togglePanel],
  ['toggleRightDock', inChatsOnly(() => dockFocus.toggleDock())],
  ['toggleTerminal', inChatsOnly(() => dockFocus.toggleView('terminal'))],
  ['toggleBrowser', inChatsOnly(() => dockFocus.toggleView('browser'))],
  ['toggleExplorer', inChatsOnly(() => dockFocus.toggleView('files'))],
  ['toggleChanges', inChatsOnly(() => dockFocus.toggleView('changes'))],
  ['browserAddress', inChatsOnly(browserAddress)],
  ['newTab', () => newTab()],
  ['closeTab', (event) => inChatsOnly(() => dockClose.closeFrom(event.target) || workspace.closeActiveTab())()],
  ['closeAllTabs', inChatsOnly(() => workspace.activeTabId && workspace.closeTabs(workspace.activeTabId, 'all'))],
  ['reopenTab', inChatsOnly(workspace.reopenTab)],
  ['nextTab', inChatsOnly(() => workspace.stepTab(1))],
  ['previousTab', inChatsOnly(() => workspace.stepTab(-1))],
  ['goToTab', (event) => inChatsOnly(() => workspace.goToTab(Number(event.code.slice(-1))))()],
  ['split', inChatsOnly(workspace.split)],
  ['rename', inChatsOnly(renameActive)],
  ['settings', () => navigation.go('settings')],
  ['zoomIn', () => appearance.stepZoom(1)],
  ['zoomOut', () => appearance.stepZoom(-1)],
  ['zoomReset', appearance.resetZoom],
]

function onKeydown(event: KeyboardEvent) {
  // CodeMirror a déjà traité la touche (⌘D, ⌘[, ⌘]) sans arrêter sa propagation.
  if (event.defaultPrevented && event.target instanceof Element && event.target.closest('.cm-editor')) return
  const action = actions.find(([id]) => shortcuts.matches(event, id))
  if (!action) return
  event.preventDefault()
  action[1](event)
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
  <!-- Délais repris de monocode. -->
  <TooltipProvider :delay-duration="300" :skip-delay-duration="400">
    <h1 class="sr-only">Nuée</h1>
    <div class="flex h-full flex-col">
      <ShellTitleBar />
      <div class="flex min-h-0 flex-1">
        <template v-if="menu">
          <template v-if="layout.rail.expanded || layout.moving.rail">
            <ShellRail />
            <ShellResizeHandle
              v-model="layout.rail.width"
              v-bind="SIZES.rail"
              orientation="vertical"
              class="separator-notch"
              :label="t('rail.resize')"
            />
          </template>
        </template>
        <template v-else>
          <ShellRail />
          <ShellResizeHandle
            v-if="layout.rail.expanded || layout.moving.rail"
            v-model="layout.rail.width"
            v-bind="SIZES.rail"
            orientation="vertical"
            :class="{ 'separator-notch': !panelShown }"
            :label="t('rail.resize')"
          />
          <div v-else class="separator w-px shrink-0" :class="{ 'separator-notch': !panelShown }" />
        </template>

        <template v-if="panelShown || layout.moving.panel">
          <ShellSidePanel :style="{ width: `${layout.panel.width}px` }" />
          <ShellResizeHandle
            v-model="layout.panel.width"
            v-bind="SIZES.panel"
            orientation="vertical"
            class="separator-notch"
            :label="t('chats.resize')"
          />
        </template>

        <div class="relative flex min-w-0 flex-1 overflow-hidden">
            <div
              v-if="chatsVisited"
              class="flex min-w-0 flex-1"
              :class="{ 'view-parked': !inChats }"
              :inert="!inChats"
            >
              <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
                <!-- Seul le chat prend le fond de la zone centrale : terminal et panneau de droite font partie du cadre. -->
                <!-- Sans colonne d'un côté, une fine marge y garde l'arrondi visible au bord de la fenêtre. -->
                <main
                  class="center-card relative isolate min-h-0 flex-1 bg-surface"
                  :class="{ 'ms-1.5': !columnAtStart, 'me-1.5': !dockShown }"
                >
                  <ShellBackground />
                  <WorkspaceView />
                  <AgentUpdateNotice v-if="inChats" />
                </main>
              </div>
              <template v-if="dockShown && inChats">
                <ShellResizeHandle
                  v-model="layout.right.size"
                  v-bind="SIZES.right"
                  orientation="vertical"
                  invert
                  class="separator-notch"
                  :label="t('dock.resize')"
                />
                <div
                  class="flex min-h-0 flex-col bg-chrome"
                  :style="{ width: `${layout.right.size}px` }"
                  :aria-label="t('dock.right')"
                  role="region"
                  data-slide-column="dock"
                >
                  <ShellDockSplit class="min-h-0 flex-1" data-slide-content />
                </div>
              </template>
            </div>

            <div v-if="navigation.view !== 'chats'" class="flex min-w-0 flex-1 overflow-hidden">
              <main
                id="view-area"
                class="center-card relative isolate min-w-0 flex-1 bg-surface"
                :class="{ 'ms-1.5': !columnAtStart, 'me-1.5': !previewedSkill }"
              >
                <ShellBackground />
                <NewWorkspaceView v-if="navigation.view === 'new'" />
                <SearchView v-else-if="navigation.view === 'search'" />
                <SettingsView v-else-if="navigation.view === 'settings'" />
                <PlaceholderView v-else :view="navigation.view" />
                <AgentUpdateNotice />
              </main>
            </div>
            <template v-if="previewedSkill">
              <ShellResizeHandle
                v-model="layout.right.size"
                v-bind="SIZES.right"
                orientation="vertical"
                invert
                class="separator-notch"
                :label="t('dock.resize')"
              />
              <SettingsSkillPanel :skill="previewedSkill" :style="{ width: `${layout.right.size}px` }" />
            </template>
          </div>
      </div>
    </div>

    <div
      v-if="drag.preview?.vertical"
      class="pointer-events-none fixed z-50 w-0.5 -translate-x-1/2 rounded-full bg-ring transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{ left: `${drag.preview.left}px`, top: `${drag.preview.top}px`, height: `${drag.preview.height}px` }"
      aria-hidden="true"
    />
    <div
      v-else-if="drag.preview?.line"
      class="pointer-events-none fixed z-50 h-0.5 -translate-y-1/2 rounded-full bg-ring transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{ left: `${drag.preview.left + 4}px`, top: `${drag.preview.top}px`, width: `${drag.preview.width - 8}px` }"
      aria-hidden="true"
    />
    <div
      v-else-if="drag.preview"
      class="pointer-events-none fixed z-50 grid place-items-center rounded-lg border border-ring bg-canvas/80 text-xs text-content transition-all duration-100 ease-out motion-reduce:transition-none"
      :style="{
        left: `${drag.preview.left + 4}px`,
        top: `${drag.preview.top + 4}px`,
        width: `${drag.preview.width - 8}px`,
        height: `${drag.preview.height - 8}px`,
      }"
      aria-hidden="true"
    >
      <!-- Même cadre que les zones du panneau de droite (ShellDockSplit) : fond allumé et ce que fera le dépôt. -->
      <span class="absolute inset-0 rounded-lg bg-signal/15" />
      <span v-if="drag.preview.label" class="relative">{{ drag.preview.label }}</span>
    </div>
    <div
      v-if="drag.ghost"
      class="ui-glass pointer-events-none fixed z-50 max-w-56 truncate rounded-md px-2.5 py-1 text-[13px] text-content shadow-lg"
      :style="{ left: `${drag.ghost.x + 12}px`, top: `${drag.ghost.y + 8}px` }"
      aria-hidden="true"
    >
      {{ drag.ghost.label }}
    </div>
    <UiConfirmDialog />
    <UiToasts />
  </TooltipProvider>
</template>
