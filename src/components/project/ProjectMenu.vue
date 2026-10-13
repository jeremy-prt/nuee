<script setup lang="ts">
import { Archive, Bell, Check, FolderInput, PaintBucket, FolderOpen, ImageUp, Pencil, Plus, SlidersHorizontal, Trash2 } from '@lucide/vue'
import { DropdownMenuItemIndicator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectLookChoices from '@/components/project/ProjectLookChoices.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { PinIcon, PinOffIcon } from '@/components/ui/pinIcons'
import { useNewChat } from '@/composables/useNewChat'
import { useProjectActions } from '@/composables/useProjectActions'
import { isMacosApp } from '@/ipc/system'
import { type IconMode, type MuteKind, type Project, useProjectsStore } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'
import { colorVar, type ProjectColor, projectColors } from '@/utils/projects'

// Contenu du menu d'un projet, posé dans son clic droit et dans son bouton « … ».
const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()
const newChat = useNewChat()

const found = computed(() => projects.icons[props.project.id])
const shown = computed(() => projects.shown(props.project))
const showsMascot = computed(() => !!shown.value && 'mascot' in shown.value)

// Les trois modes des réglages du projet : « Détectée » grisé sans icône dans le dossier, « Image » sans image
// importée ouvre le sélecteur.
const noIcon = computed(() => !!found.value && !found.value.detected)
const iconModes = computed(() =>
  (['auto', 'mascot', 'image'] as const).map((value) => ({
    value,
    label: t(`settings.projects.iconModes.${value}`),
    disabled: value === 'auto' && noIcon.value,
    hint: value === 'auto' && noIcon.value ? t('settings.projects.iconHints.none') : undefined,
  })),
)
const iconMode = computed(() => (props.project.icon === 'auto' && noIcon.value ? 'mascot' : props.project.icon))

const muteValue = computed(() => (projects.isMuted(props.project.id) ? (props.project.muted?.kind ?? 'on') : 'on'))
const muteOptions = computed(() =>
  (['on', 'hour', 'tomorrow', 'always'] as const).map((value) => ({ value, label: t(`settings.projects.mute.${value}`) })),
)

const activeChats = computed(() => workspace.tabsFor(props.project.id).some((tab) => tab.started && !tab.archived))

const backgroundName = computed(() =>
  props.project.background ? t(`settings.projects.colors.${props.project.background}`) : t('settings.projects.backgroundNone'),
)

function pickBackground(value: unknown) {
  props.project.background = (value || null) as ProjectColor | null
}

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

function pickMute(value: string) {
  projects.mute(props.project, value === 'on' ? null : (value as MuteKind))
}
</script>

<template>
  <!-- Mascottes et couleurs n'ont d'effet que sur une mascotte : rien à choisir avec une icône ou une image. -->
  <template v-if="showsMascot">
    <ProjectLookChoices
      :mascot="projects.mascotFor(project)"
      :color="project.color"
      @mascot="project.mascot = $event"
      @color="project.color = $event"
    />
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

  <UiMenuSub :label="t('settings.projects.background')" :icon="PaintBucket" :value="backgroundName">
    <DropdownMenuRadioGroup :model-value="project.background ?? ''" @update:model-value="pickBackground">
      <DropdownMenuRadioItem
        v-for="color in ['', ...projectColors]"
        :key="color"
        :value="color"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-1.5 pe-2.5 text-content/75 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content"
      >
        <span class="grid size-3.5 shrink-0 place-items-center">
          <DropdownMenuItemIndicator><Check class="size-3" aria-hidden="true" /></DropdownMenuItemIndicator>
        </span>
        <span
          class="size-3 shrink-0 rounded-full"
          :class="{ 'border border-stroke-focus': !color }"
          :style="color ? { background: colorVar(color as ProjectColor) } : undefined"
          aria-hidden="true"
        />
        {{ color ? t(`settings.projects.colors.${color}`) : t('settings.projects.backgroundNone') }}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </UiMenuSub>
  <UiMenuSub :label="t('groups.moveTo')" :icon="FolderInput" :value="groupName">
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
    :label="project.pinned ? t('menu.unpinProject') : t('menu.pinProject')"
    :icon="project.pinned ? PinOffIcon : PinIcon"
    @select="project.pinned = !project.pinned"
  />
  <UiMenuItem :label="t('chats.newChat')" :icon="Plus" @select="newChat(project.id)" />
  <UiMenuItem :label="t('menu.rename')" :icon="Pencil" @select="emit('rename')" />
  <UiMenuItem
    :label="t(isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder')"
    :icon="FolderOpen"
    @select="actions.reveal(project)"
  />
  <UiMenuSub :label="t('settings.projects.notifications')" :icon="Bell">
    <UiMenuChoices :section="{ id: 'mute', value: muteValue, options: muteOptions }" @select="pickMute" />
  </UiMenuSub>
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
