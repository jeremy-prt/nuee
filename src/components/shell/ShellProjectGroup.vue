<script setup lang="ts">
import { ChevronRight, Folder, FolderOpen } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectGroupMenu from '@/components/project/ProjectGroupMenu.vue'
import ShellProjectItem from '@/components/shell/ShellProjectItem.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameInput from '@/components/ui/UiRenameInput.vue'
import { type ProjectGroup, useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { rowTint } from '@/utils/projects'

// Groupe de la barre latérale dépliée : un dossier, ses projets décalés en dessous.
const props = defineProps<{ group: ProjectGroup }>()

const { t } = useI18n()
const projects = useProjectsStore()
const shortcuts = useShortcutsStore()

const header = useTemplateRef<HTMLButtonElement>('header')
const members = computed(() => projects.projectsIn(props.group.id))
const renaming = ref(false)
const menuOpen = ref(false)
let byKeyboard = false

function startRename(keyboard = false) {
  byKeyboard = keyboard
  renaming.value = true
}

async function stopRename(name?: string) {
  renaming.value = false
  if (name) projects.renameGroup(props.group, name)
  if (!byKeyboard) return
  await nextTick()
  header.value?.focus()
}

// Créé depuis le menu d'un projet : l'en-tête passe en renommage une fois le menu refermé.
function takeEdit() {
  if (projects.editingGroupId !== props.group.id) return
  projects.editingGroupId = null
  startRename()
}
onMounted(takeEdit)
watch(() => projects.editingGroupId, takeEdit)

function onKeydown(event: KeyboardEvent) {
  if (!shortcuts.matches(event, 'rename')) return
  event.preventDefault()
  event.stopPropagation()
  startRename(true)
}
</script>

<template>
  <div>
    <UiContextMenu :disabled="renaming" @update:open="menuOpen = $event">
      <div class="group/row group relative" :data-group-id="group.id">
        <UiRenameInput v-if="renaming" :value="group.name" :label="t('groups.nameLabel')" wide @commit="stopRename" @cancel="stopRename()">
          <component :is="group.collapsed ? Folder : FolderOpen" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        </UiRenameInput>
        <template v-else>
          <button
            ref="header"
            type="button"
            class="flex h-8 w-full items-center gap-2.5 rounded-md ps-2 pe-8 text-sm whitespace-nowrap text-muted hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            :class="
              group.background
                ? menuOpen ? 'bg-(--row-hover) text-content' : 'bg-(--row-rest) group-hover/row:bg-(--row-hover)'
                : menuOpen ? 'bg-selection-hover text-content' : 'group-hover/row:bg-selection-hover'
            "
            :style="group.background ? rowTint(group.background) : undefined"
            :aria-expanded="!group.collapsed"
            :aria-label="`${group.name}, ${t('groups.count', { n: members.length }, members.length)}`"
            :aria-keyshortcuts="shortcuts.aria('rename')"
            @click="group.collapsed = !group.collapsed"
            @dblclick="startRename()"
            @keydown="onKeydown"
          >
            <component :is="group.collapsed ? Folder : FolderOpen" class="size-4 shrink-0" aria-hidden="true" />
            <span
              class="min-w-0 flex-1 truncate text-start"
              :class="menuOpen ? 'fade-under-one' : 'group-focus-within:fade-under-one group-hover:fade-under-one'"
            >
              {{ group.name }}
            </span>
          </button>
          <!-- Chevron toujours visible tout à droite ; le bouton « … » apparaît à sa gauche au survol. -->
          <ChevronRight
            class="pointer-events-none absolute end-2.5 top-2.5 size-3 text-muted transition-[rotate] duration-150 motion-reduce:transition-none rtl:-scale-x-100"
            :class="{ 'rotate-90': !group.collapsed }"
            aria-hidden="true"
          />
          <div
            class="absolute end-7 top-1 transition-opacity duration-(--hover-duration) ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
            :class="menuOpen ? 'opacity-100' : 'opacity-0'"
          >
            <UiMoreMenu :label="t('groups.more')" :keep-focus="() => renaming" @update:open="menuOpen = $event">
              <ProjectGroupMenu :group="group" @rename="startRename()" />
            </UiMoreMenu>
          </div>
        </template>
      </div>
      <template #menu><ProjectGroupMenu :group="group" @rename="startRename()" /></template>
    </UiContextMenu>
    <!-- Projets décalés sous l'en-tête, avec un trait aligné sur l'icône du dossier : ils appartiennent au groupe. -->
    <div v-if="!group.collapsed" class="ms-4 mt-0.5 space-y-0.5 border-s border-stroke ps-1.5">
      <ShellProjectItem v-for="project in members" :key="project.id" :project="project" />
    </div>
  </div>
</template>
