<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import WorkspacePane from '@/components/workspace/WorkspacePane.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
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
    <button
      type="button"
      class="h-8 rounded-md border border-stroke px-3 text-sm hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-accent"
      @click="newChat()"
    >
      {{ t('chats.newChat') }}
    </button>
  </div>
</template>
