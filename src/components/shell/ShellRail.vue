<script setup lang="ts">
import {
  ArrowLeft,
  CircleDot,
  Folder,
  FolderPlus,
  Gauge,
  GitPullRequest,
  House,
  MessagesSquare,
  NotebookPen,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
} from '@lucide/vue'
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { pickFolder } from '@/ipc/dialog'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUpdatesStore } from '@/stores/updates'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const updates = useUpdatesStore()

const footerButtons = useTemplateRef<HTMLButtonElement[]>('footerButtons')

// Le focus ne suit que si on a validé au clavier le bouton qui disparaît (Réglages, Retour) :
// un clic, Échap ou un raccourci le laissent où il est. `detail` vaut 0 pour un clic venu du clavier.
const byKeyboard = ref(false)

watch(
  () => navigation.view,
  async (_, previous) => {
    const restore = byKeyboard.value
    await nextTick()
    byKeyboard.value = false
    if (restore && previous === 'settings') footerButtons.value?.find((button) => button.dataset.view === 'settings')?.focus()
  },
)

function openFooter(open: () => void, event: MouseEvent) {
  byKeyboard.value = event.detail === 0
  open()
}

function closeSettings(event: MouseEvent) {
  byKeyboard.value = event.detail === 0
  navigation.closeSettings()
}

async function addProject() {
  const path = await pickFolder(t('rail.pickProject'))
  if (path) navigation.openChats(projects.add(path).id)
}

const pages = [
  { view: 'home', icon: House },
  { view: 'issues', icon: CircleDot },
  { view: 'pullRequests', icon: GitPullRequest },
  { view: 'notes', icon: NotebookPen },
  { view: 'search', icon: Search, shortcut: 'search' },
] as const

// Mises à jour n'est pas une vue : le bouton mène à Réglages > Général.
const footer = [
  { id: 'settings', icon: Settings, shortcut: 'settings', open: () => navigation.go('settings') },
  { id: 'usage', icon: Gauge, open: () => navigation.go('usage') },
  { id: 'updates', icon: RefreshCw, open: () => navigation.openSettings('general') },
] as const

function footerLabel(id: (typeof footer)[number]['id']) {
  return id === 'updates' && updates.status === 'available' ? t('updates.availableTitle') : t(`rail.${id}`)
}
</script>

<template>
  <aside
    id="shell-rail"
    class="flex shrink-0 flex-col overflow-hidden bg-chrome"
    :style="{ width: `${layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH}px` }"
  >
    <nav
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2"
      :aria-label="navigation.view === 'settings' ? t('settings.nav') : t('rail.label')"
    >
      <ShellRailItem
        v-if="!layout.rail.expanded"
        :icon="PanelLeftOpen"
        :label="t('rail.toggle')"
        :shortcut="shortcuts.label('toggleRail')"
        :expanded="false"
        aria-controls="shell-rail"
        :aria-expanded="false"
        @click="layout.toggleRail()"
      />
      <SettingsNav v-if="navigation.view === 'settings'" :focus-current="byKeyboard" />
      <template v-else>
        <ShellRailItem
          v-for="item in pages"
          :key="item.view"
          :icon="item.icon"
          :label="t(`rail.${item.view}`)"
          :shortcut="'shortcut' in item ? shortcuts.label(item.shortcut) : undefined"
          :expanded="layout.rail.expanded"
          :active="navigation.view === item.view"
          @click="navigation.go(item.view)"
        />

        <div class="my-3 h-px shrink-0 bg-stroke" />
        <ShellRailItem
          :icon="MessagesSquare"
          :label="t('rail.chats')"
          :expanded="layout.rail.expanded"
          :active="navigation.view === 'chats' && navigation.projectId === null"
          @click="navigation.openChats(null)"
        />

        <!-- Même hauteur dans les deux états : les projets en dessous ne bougent pas au repli. -->
        <div class="mt-3 flex h-8 shrink-0 items-center" :class="{ 'ps-2': layout.rail.expanded }">
          <p v-if="layout.rail.expanded" class="min-w-0 flex-1 truncate text-xs font-medium whitespace-nowrap text-muted">
            {{ t('rail.projects') }}
          </p>
          <UiTooltip :label="t('rail.addProject')" :side="layout.rail.expanded ? 'top' : 'right'" :side-offset="8">
            <button
              type="button"
              class="grid shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              :class="layout.rail.expanded ? 'size-7' : 'size-8'"
              :aria-label="t('rail.addProject')"
              @click="addProject()"
            >
              <FolderPlus class="size-4" aria-hidden="true" />
            </button>
          </UiTooltip>
        </div>
        <ShellRailItem
          v-for="project in projects.projects"
          :key="project.id"
          :icon="Folder"
          :label="project.name"
          :expanded="layout.rail.expanded"
          :active="navigation.view === 'chats' && navigation.projectId === project.id"
          @click="navigation.openChats(project.id)"
        />
      </template>
    </nav>

    <div v-if="navigation.view === 'settings'" class="shrink-0 p-2">
      <ShellRailItem
        :icon="ArrowLeft"
        :label="t('settings.back')"
        :expanded="layout.rail.expanded"
        @click="closeSettings($event)"
      />
    </div>
    <!-- Dépliée : une ligne (Réglages et Quota à gauche, Mises à jour à droite). Repliée : une colonne de 48 px. -->
    <div v-else class="flex shrink-0 gap-0.5 p-2" :class="layout.rail.expanded ? 'flex-row' : 'flex-col'">
      <template v-for="(item, index) in footer" :key="item.id">
        <span v-if="layout.rail.expanded && index === footer.length - 1" class="flex-1" />
        <UiTooltip
          :label="footerLabel(item.id)"
          :shortcut="'shortcut' in item ? shortcuts.label(item.shortcut) : undefined"
          :side="layout.rail.expanded ? 'top' : 'right'"
          :side-offset="8"
        >
          <button
            ref="footerButtons"
            type="button"
            :data-view="item.id"
            class="relative grid size-8 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            :class="navigation.view === item.id ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
            :aria-label="footerLabel(item.id)"
            :aria-current="navigation.view === item.id ? 'page' : undefined"
            @click="openFooter(item.open, $event)"
          >
            <component :is="item.icon" class="size-4" aria-hidden="true" />
            <span
              v-if="item.id === 'updates' && updates.status === 'available'"
              class="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
          </button>
        </UiTooltip>
      </template>
    </div>
  </aside>
</template>
