<script setup lang="ts">
import { Pin } from '@/components/ui/icons'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'

// Sessions du projet en cours (ou du Chat sans projet) : panneau latéral, ou barre latérale en « Projets en menu ».
// `titled` : le titre « Sessions » est déjà posé au-dessus, la liste n'en remet pas un.
defineProps<{ titled?: boolean }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const { shown: recentShown, more, limit, sentinel } = useProgressiveList(
  computed(() => workspace.recentChats),
  () => navigation.projectId,
)

// Branches des sessions : relues à chaque arrivée sur le projet, une branche a pu changer hors de Nuée.
watch(
  () => projects.byId(navigation.projectId),
  (project) => {
    if (project) worktrees.load(project)
  },
  { immediate: true },
)
</script>

<template>
  <template v-if="workspace.contextChats.length">
    <!-- Titres de groupe seulement s'il y a des sessions épinglées : sinon la liste se suffit. -->
    <template v-if="workspace.pinnedChats.length">
      <h2 class="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
        <Pin class="size-3" aria-hidden="true" />{{ t('chats.pinned') }}
      </h2>
      <ul class="space-y-0.5">
        <li v-for="tab in workspace.pinnedChats" :key="tab.id"><ShellChatItem :tab="tab" /></li>
      </ul>
      <h2 v-if="workspace.recentChats.length && !titled" class="mt-3 flex h-7 items-center px-2 text-xs font-medium text-muted">
        {{ t('chats.recent') }}
      </h2>
      <div v-else-if="workspace.recentChats.length" class="mx-2 my-2 h-px bg-stroke" />
    </template>
    <ul class="space-y-0.5">
      <li v-for="tab in recentShown" :key="tab.id"><ShellChatItem :tab="tab" /></li>
    </ul>
    <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
  </template>
  <p v-else class="px-2 text-sm text-muted">
    {{ shortcuts.label('newChat') ? t('chats.empty', { shortcut: shortcuts.label('newChat') }) : t('chats.emptyNoShortcut') }}
  </p>
</template>
