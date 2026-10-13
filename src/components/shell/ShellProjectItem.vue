<script setup lang="ts">
import { BellOff } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import ProjectMenu from '@/components/project/ProjectMenu.vue'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameInput from '@/components/ui/UiRenameInput.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { PinIcon, PinOffIcon } from '@/components/ui/pinIcons'
import { useProjectActions } from '@/composables/useProjectActions'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { colorVar } from '@/utils/projects'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const shortcuts = useShortcutsStore()
const actions = useProjectActions()

const active = computed(() => navigation.view === 'chats' && navigation.projectId === props.project.id)
const renaming = ref(false)
const menuOpen = ref(false)
let byKeyboard = false

// Barre repliée, le nom n'a pas la place de s'éditer : il se change dans les réglages du projet.
function startRename(keyboard = false) {
  if (!layout.rail.expanded) return actions.openSettings(props.project)
  byKeyboard = keyboard
  renaming.value = true
}

async function stopRename(name?: string) {
  renaming.value = false
  if (name) projects.rename(props.project, name)
  if (!byKeyboard) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-project-row="${props.project.id}"]`)?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!shortcuts.matches(event, 'rename')) return
  event.preventDefault()
  event.stopPropagation()
  startRename(true)
}

function onDoubleClick() {
  if (layout.rail.expanded) startRename()
}
</script>

<template>
  <UiContextMenu :disabled="renaming" @update:open="menuOpen = $event">
    <div class="group relative">
      <UiRenameInput
        v-if="renaming"
        :value="project.name"
        :label="t('settings.projects.name')"
        wide
        @commit="stopRename"
        @cancel="stopRename()"
      >
        <ProjectIcon :project="project" class="size-4 shrink-0" />
      </UiRenameInput>
      <template v-else>
        <ShellRailItem
          :data-project-row="project.id"
          :label="project.name"
          :state="projects.isMuted(project.id) ? t('settings.projects.muted') : undefined"
          :expanded="layout.rail.expanded"
          :active="active"
          :end-space="layout.rail.expanded"
          :tint="project.background ? colorVar(project.background) : undefined"
          :held="menuOpen"
          :aria-keyshortcuts="shortcuts.aria('rename')"
          @click="navigation.openChats(project.id)"
          @dblclick="onDoubleClick"
          @keydown="onKeydown"
        >
          <template #icon>
            <ProjectIcon
              :project="project"
              class="size-4 shrink-0"
              :class="{ 'transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0 motion-reduce:transition-none': layout.rail.expanded }"
            />
          </template>
          <template v-if="projects.isMuted(project.id) || (project.pinned && project.group)" #end>
            <BellOff v-if="projects.isMuted(project.id)" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <!-- Épinglé dans un groupe : en tête du groupe, l'épingle dit pourquoi. -->
            <PinIcon v-if="project.pinned && project.group" class="size-3 shrink-0 text-muted" aria-hidden="true" />
          </template>
        </ShellRailItem>
        <!-- Épingle à la place de l'icône au survol, comme monocode. Repliée, la barre n'a que l'icône. -->
        <UiTooltip v-if="layout.rail.expanded" :label="project.pinned ? t('menu.unpinProject') : t('menu.pinProject')">
          <button
            type="button"
            class="absolute start-1 top-1 grid size-6 place-items-center rounded text-muted opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            :aria-label="project.pinned ? t('menu.unpinProject') : t('menu.pinProject')"
            @click="project.pinned = !project.pinned"
          >
            <component :is="project.pinned ? PinOffIcon : PinIcon" class="size-3.5" aria-hidden="true" />
          </button>
        </UiTooltip>
        <div
          v-if="layout.rail.expanded"
          class="absolute end-1 top-1 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
          :class="menuOpen ? 'opacity-100' : 'opacity-0'"
        >
          <UiMoreMenu :label="t('menu.projectMore')" :keep-focus="() => renaming" @update:open="menuOpen = $event">
            <ProjectMenu :project="project" @rename="startRename()" />
          </UiMoreMenu>
        </div>
      </template>
    </div>
    <template #menu><ProjectMenu :project="project" @rename="startRename()" /></template>
  </UiContextMenu>
</template>
