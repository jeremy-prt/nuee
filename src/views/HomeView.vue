<script setup lang="ts">
import { SquarePen } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { useNewChat } from '@/composables/useNewChat'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
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
        <dd class="mt-1 text-2xl font-semibold">{{ workspace.startedChats.length }}</dd>
      </div>
      <div class="rounded-xl border border-stroke bg-selection/40 px-4 py-3">
        <dt class="text-xs text-muted">{{ t('home.projects') }}</dt>
        <dd class="mt-1 text-2xl font-semibold">{{ projects.projects.length }}</dd>
      </div>
    </dl>

    <UiButton variant="primary" :aria-keyshortcuts="shortcuts.aria('newChat')" @click="newChat(null)">
      <SquarePen class="size-4" aria-hidden="true" />{{ t('chats.newChat') }}
      <kbd v-if="shortcuts.label('newChat')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('newChat') }}</kbd>
    </UiButton>
  </div>
</template>
