<script setup lang="ts">
import { Archive, Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesFinderIcon from '@/components/files/FilesFinderIcon.vue'
import ProjectAgentMenus from '@/components/project/ProjectAgentMenus.vue'
import ProjectMuteMenu from '@/components/project/ProjectMuteMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useProjectActions } from '@/composables/useProjectActions'
import { isMacosApp } from '@/ipc/system'
import { useProjectsStore } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'

// Menu de « Sans projet » : ce qui, dans celui d'un projet, garde un sens sans dossier de projet.
const { t } = useI18n()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()
const newChat = useNewChat()

const activeChats = computed(() => workspace.tabsFor(null).some((tab) => tab.started && !tab.archived))
</script>

<template>
  <UiMenuItem :label="t('chats.newChat')" :icon="Plus" @select="newChat(null)" />
  <UiMenuItem
    :label="t(isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder')"
    :icon="FilesFinderIcon"
    @select="actions.revealScratch()"
  />
  <ProjectAgentMenus :project-id="null" />
  <ProjectMuteMenu :settings="projects.computer" :project-id="null" />
  <UiMenuSeparator />
  <UiMenuItem
    :label="t('menu.archiveProjectChats')"
    :icon="Archive"
    :disabled="!activeChats"
    @select="actions.archiveProjectChats({ id: null, name: t('rail.chats') })"
  />
</template>
