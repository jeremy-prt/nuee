<script setup lang="ts">
import { NoProject } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import ChatHostPicker from '@/components/chat/ChatHostPicker.vue'
import ChatWorktreePicker, { type WorktreeChoice } from '@/components/chat/ChatWorktreePicker.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import type { Project } from '@/stores/projects'

// Ligne au-dessus du champ d'une session vierge, comme Paseo : projet, machine, endroit. Le slot `project` remplace
// le projet affiché par un sélecteur (Nouvel espace de travail).
defineProps<{ chatId: string; project: Project | null; worktree: WorktreeChoice | null }>()
const emit = defineEmits<{ worktree: [choice: string] }>()

const { t } = useI18n()

const placeBadge =
  'group flex h-7 min-w-0 items-center gap-2 rounded-md px-2 whitespace-nowrap text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-selection-hover aria-expanded:text-content'
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
    <slot name="project">
      <p class="flex h-7 min-w-0 items-center gap-2 px-2 text-muted" :title="project?.path">
        <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
        <NoProject v-else class="size-4 shrink-0" aria-hidden="true" />
        <span class="sr-only">{{ t('composer.project') }}</span>
        <span class="truncate">{{ project?.name ?? t('rail.chats') }}</span>
      </p>
    </slot>
    <ChatHostPicker :class="placeBadge" />
    <ChatWorktreePicker
      v-if="project && worktree"
      :chat-id="chatId"
      :worktree="worktree"
      :disabled="false"
      side="bottom"
      :class="placeBadge"
      @worktree="emit('worktree', $event)"
    />
  </div>
</template>
