<script setup lang="ts">
import { Archive, FolderInput, FolderOpen, ImageUp, Pencil, Pin, PinOff, Plus, SlidersHorizontal, Trash2 } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectBackgroundMenu from '@/components/project/ProjectBackgroundMenu.vue'
import ProjectColorChoices from '@/components/project/ProjectColorChoices.vue'
import ProjectMuteMenu from '@/components/project/ProjectMuteMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useProjectActions } from '@/composables/useProjectActions'
import { isMacosApp } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { type IconMode, type Project, useProjectsStore } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'

// Contenu du menu d'un projet, posé dans son clic droit et dans son bouton « … ».
const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const appearance = useAppearanceStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()
const newChat = useNewChat()

const found = computed(() => projects.icons[props.project.id])
const shown = computed(() => projects.shown(props.project))
const showsLetter = computed(() => shown.value === 'letter')

// Les trois modes des réglages du projet : « Détectée » grisé sans icône dans le dossier, « Image » sans image
// importée ouvre le sélecteur.
const noIcon = computed(() => !!found.value && !found.value.detected)
const iconModes = computed(() =>
  (['auto', 'letter', 'image'] as const).map((value) => ({
    value,
    label: t(`settings.projects.iconModes.${value}`),
    disabled: value === 'auto' && noIcon.value,
    hint: value === 'auto' && noIcon.value ? t('settings.projects.iconHints.none') : undefined,
  })),
)
const iconMode = computed(() => (props.project.icon === 'auto' && noIcon.value ? 'letter' : props.project.icon))

// En « Projets en menu », la liste des projets est à plat : épingle et groupe n'y changeraient rien de visible.
const inColumn = computed(() => appearance.layout !== 'menu')

const activeChats = computed(() => workspace.tabsFor(props.project.id).some((tab) => tab.started && !tab.archived))

const groupValue = computed(() => props.project.group ?? '')
const groupOptions = computed(() => [
  ...projects.groups.map((group) => ({ value: group.id, label: group.name })),
  { value: '', label: t('groups.none') },
])
const groupName = computed(() => projects.groups.find((group) => group.id === props.project.group)?.name ?? t('groups.none'))

function newGroup() {
  projects.moveToGroup(props.project, projects.createGroup().id)
}

function pickMode(value: string) {
  if (value === 'image' && !found.value?.custom) actions.importIcon(props.project)
  else props.project.icon = value as IconMode
}
</script>

<template>
  <!-- La couleur n'a d'effet que sur l'initiale : rien à choisir avec une icône ou une image. -->
  <template v-if="showsLetter">
    <ProjectColorChoices :color="project.color" @color="project.color = $event" />
    <UiMenuSeparator />
  </template>

  <UiMenuSub :label="t('settings.projects.icon')" :icon="ImageUp" :value="t(`settings.projects.iconModes.${iconMode}`)">
    <UiMenuChoices
      :section="{ id: 'icon', value: iconMode, options: iconModes }"
      @select="pickMode"
    />
    <template v-if="found?.custom">
      <UiMenuSeparator />
      <UiMenuItem :label="t('settings.projects.changeImage')" @select="actions.importIcon(project)" />
    </template>
  </UiMenuSub>

  <ProjectBackgroundMenu v-model="project.background" />
  <UiMenuSub v-if="inColumn" :label="t('groups.moveTo')" :icon="FolderInput" :value="groupName">
    <UiMenuItem :label="t('groups.create')" :icon="Plus" @select="newGroup" />
    <template v-if="projects.groups.length">
      <UiMenuSeparator />
      <UiMenuChoices
        :section="{ id: 'group', value: groupValue, options: groupOptions }"
        @select="projects.moveToGroup(project, $event || null)"
      />
    </template>
  </UiMenuSub>

  <UiMenuSeparator />
  <UiMenuItem
    v-if="inColumn"
    :label="project.pinned ? t('menu.unpinProject') : t('menu.pinProject')"
    :icon="project.pinned ? PinOff : Pin"
    @select="project.pinned = !project.pinned"
  />
  <UiMenuItem :label="t('chats.newChat')" :icon="Plus" @select="newChat(project.id)" />
  <UiMenuItem :label="t('menu.rename')" :icon="Pencil" @select="emit('rename')" />
  <UiMenuItem
    :label="t(isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder')"
    :icon="FolderOpen"
    @select="actions.reveal(project)"
  />
  <ProjectMuteMenu :settings="project" :project-id="project.id" />
  <UiMenuItem :label="t('menu.projectSettings')" :icon="SlidersHorizontal" @select="actions.openSettings(project)" />

  <UiMenuSeparator />
  <UiMenuItem
    :label="t('menu.archiveProjectChats')"
    :icon="Archive"
    :disabled="!activeChats"
    @select="actions.archiveProjectChats(project)"
  />
  <UiMenuItem :label="t('menu.deleteProject')" :icon="Trash2" danger @select="actions.deleteProject(project)" />
</template>
