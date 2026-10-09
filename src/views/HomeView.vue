<script setup lang="ts">
import { SquarePen } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useNewChat } from '@/composables/useNewChat'
import { useProjectsStore } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const projects = useProjectsStore()
const newChat = useNewChat()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto px-6 pb-16">
    <div class="text-center">
      <h2 class="text-3xl font-semibold tracking-tight">Nuée</h2>
      <p class="mt-2 text-sm text-muted">{{ t('home.subtitle') }}</p>
    </div>

    <dl class="grid w-full max-w-md grid-cols-2 gap-3">
      <div class="rounded-xl border border-stroke bg-selection/40 px-4 py-3">
        <dt class="text-xs text-muted">{{ t('home.chats') }}</dt>
        <dd class="mt-1 text-2xl font-semibold">{{ workspace.tabs.length }}</dd>
      </div>
      <div class="rounded-xl border border-stroke bg-selection/40 px-4 py-3">
        <dt class="text-xs text-muted">{{ t('home.projects') }}</dt>
        <dd class="mt-1 text-2xl font-semibold">{{ projects.projects.length }}</dd>
      </div>
    </dl>

    <button
      type="button"
      class="flex h-9 items-center gap-2 rounded-md bg-content px-4 text-sm font-medium text-canvas hover:bg-content/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      @click="newChat(null)"
    >
      <SquarePen class="size-4" aria-hidden="true" />
      {{ t('chats.newChat') }}
      <kbd class="font-sans text-xs opacity-60">{{ shortcutLabel(shortcuts.newChat) }}</kbd>
    </button>
  </div>
</template>
