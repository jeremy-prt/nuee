<script setup lang="ts">
import { BellOff, Pin } from '@/components/ui/icons'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import ProjectMenu from '@/components/project/ProjectMenu.vue'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameInput from '@/components/ui/UiRenameInput.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useProjectActions } from '@/composables/useProjectActions'
import { useDragStore } from '@/stores/drag'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const shortcuts = useShortcutsStore()
const actions = useProjectActions()
const drag = useDragStore()
const { startProjectDrag } = useLayoutDrag()

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
    <div class="group/row group relative">
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
          :tint="project.background ?? undefined"
          :held="menuOpen"
          :class="{ 'opacity-50': drag.source?.kind === 'project' && drag.source.id === project.id }"
          :aria-keyshortcuts="shortcuts.aria('rename')"
          @click="navigation.openChats(project.id)"
          @pointerdown="startProjectDrag($event, project.id)"
          @dblclick="onDoubleClick"
          @keydown="onKeydown"
        >
          <template #icon><ProjectIcon :project="project" class="size-4 shrink-0" /></template>
          <template v-if="projects.isMuted(project.id) || (project.pinned && project.group)" #end>
            <BellOff v-if="projects.isMuted(project.id)" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <!-- Épinglé dans un groupe : en tête du groupe, l'épingle dit pourquoi. -->
            <Pin v-if="project.pinned && project.group" class="size-3 shrink-0 text-muted" aria-hidden="true" />
          </template>
        </ShellRailItem>
        <div
          v-if="layout.rail.expanded"
          class="absolute end-1 top-1 transition-opacity duration-(--hover-duration) ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
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
