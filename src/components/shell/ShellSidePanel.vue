<script setup lang="ts">
import { Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatList from '@/components/shell/ShellChatList.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const newChat = useNewChat()

const title = computed(() => {
  if (navigation.view !== 'chats') return t(`rail.${navigation.view}`)
  return projects.byId(navigation.projectId)?.name ?? t('rail.chats')
})
</script>

<template>
  <aside id="shell-panel" class="flex shrink-0 flex-col bg-frame" :aria-label="title">
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
      <ShellChatList v-if="navigation.view === 'chats'" />
      <p v-else class="px-2 text-sm text-muted">{{ t(`empty.${navigation.view}`) }}</p>
    </div>
  </aside>
</template>
