<script setup lang="ts">
import { Pin, Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const newChat = useNewChat()
const { shown: recentShown, more, limit, sentinel } = useProgressiveList(
  computed(() => workspace.recentChats),
  () => navigation.projectId,
)

const title = computed(() => {
  if (navigation.view !== 'chats') return t(`rail.${navigation.view}`)
  return projects.byId(navigation.projectId)?.name ?? t('rail.chats')
})
</script>

<template>
  <aside id="shell-panel" class="flex shrink-0 flex-col bg-chrome" :aria-label="title">
    <div class="flex h-10 shrink-0 items-center gap-1 px-2">
      <p class="min-w-0 flex-1 truncate px-2 text-sm font-medium">{{ title }}</p>
      <UiIconButton
        v-if="navigation.view === 'chats'"
        :label="t('chats.newChat')"
        :shortcut="shortcuts.label('newChat')"
        @click="newChat()"
      >
        <Plus class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <template v-if="navigation.view === 'chats'">
        <template v-if="workspace.contextChats.length">
          <!-- Titres de groupe seulement s'il y a des sessions épinglées : sinon la liste se suffit. -->
          <template v-if="workspace.pinnedChats.length">
            <h2 class="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
              <Pin class="size-3" aria-hidden="true" />{{ t('chats.pinned') }}
            </h2>
            <ul class="space-y-0.5">
              <li v-for="tab in workspace.pinnedChats" :key="tab.id"><ShellChatItem :tab="tab" /></li>
            </ul>
            <h2 v-if="workspace.recentChats.length" class="mt-3 flex h-7 items-center px-2 text-xs font-medium text-muted">
              {{ t('chats.recent') }}
            </h2>
          </template>
          <ul class="space-y-0.5">
            <li v-for="tab in recentShown" :key="tab.id"><ShellChatItem :tab="tab" /></li>
          </ul>
          <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
        </template>
        <p v-else class="px-2 text-sm text-muted">{{ shortcuts.label('newChat') ? t('chats.empty', { shortcut: shortcuts.label('newChat') }) : t('chats.emptyNoShortcut') }}</p>
      </template>
      <p v-else class="px-2 text-sm text-muted">{{ t(`empty.${navigation.view}`) }}</p>
    </div>
  </aside>
</template>
