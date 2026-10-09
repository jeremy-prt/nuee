<script setup lang="ts">
import {
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
import { useI18n } from 'vue-i18n'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { pickFolder } from '@/ipc/dialog'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()

async function addProject() {
  const path = await pickFolder(t('rail.addProject'))
  if (path) navigation.openChats(projects.add(path).id)
}

const pages = [
  { view: 'home', icon: House },
  { view: 'issues', icon: CircleDot },
  { view: 'pullRequests', icon: GitPullRequest },
  { view: 'notes', icon: NotebookPen },
  { view: 'search', icon: Search, shortcut: shortcutLabel(shortcuts.search) },
] as const

const footer = [
  { view: 'settings', icon: Settings },
  { view: 'usage', icon: Gauge },
  { view: 'updates', icon: RefreshCw },
] as const
</script>

<template>
  <aside
    id="shell-rail"
    class="flex shrink-0 flex-col overflow-hidden bg-canvas macos:bg-canvas/40"
    :style="{ width: `${layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH}px` }"
  >
    <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2" :aria-label="t('rail.label')">
      <ShellRailItem
        v-if="!layout.rail.expanded"
        :icon="PanelLeftOpen"
        :label="t('rail.toggle')"
        :shortcut="shortcutLabel(shortcuts.toggleRail)"
        :expanded="false"
        aria-controls="shell-rail"
        :aria-expanded="false"
        @click="layout.toggleRail()"
      />
      <ShellRailItem
        v-for="item in pages"
        :key="item.view"
        :icon="item.icon"
        :label="t(`rail.${item.view}`)"
        :shortcut="'shortcut' in item ? item.shortcut : undefined"
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
            class="grid shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
    </nav>

    <!-- Dépliée : une ligne (Réglages et Quota à gauche, Mises à jour à droite). Repliée : une colonne de 48 px. -->
    <div class="flex shrink-0 gap-0.5 p-2" :class="layout.rail.expanded ? 'flex-row' : 'flex-col'">
      <template v-for="(item, index) in footer" :key="item.view">
        <span v-if="layout.rail.expanded && index === footer.length - 1" class="flex-1" />
        <UiTooltip :label="t(`rail.${item.view}`)" :side="layout.rail.expanded ? 'top' : 'right'" :side-offset="8">
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            :class="navigation.view === item.view ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
            :aria-label="t(`rail.${item.view}`)"
            :aria-current="navigation.view === item.view ? 'page' : undefined"
            @click="navigation.go(item.view)"
          >
            <component :is="item.icon" class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
      </template>
    </div>
  </aside>
</template>
