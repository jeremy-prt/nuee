<script setup lang="ts">
import { SquarePen } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import WorkspacePane from '@/components/workspace/WorkspacePane.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const newChat = useNewChat()
</script>

<template>
  <div v-if="workspace.panes.length" class="flex h-full min-h-0">
    <template v-for="(_, index) in workspace.panes" :key="index">
      <div v-if="index > 0" class="w-px shrink-0 bg-stroke" />
      <WorkspacePane :index="index" />
    </template>
  </div>
  <div v-else class="flex h-full flex-col items-center justify-center gap-3">
    <p class="text-sm text-muted">{{ t('workspace.empty') }}</p>
    <UiButton variant="primary" :aria-keyshortcuts="shortcuts.aria('newChat')" @click="newChat()">
      <SquarePen class="size-4" aria-hidden="true" />{{ t('chats.newChat') }}
      <kbd v-if="shortcuts.label('newChat')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('newChat') }}</kbd>
    </UiButton>
  </div>
</template>
