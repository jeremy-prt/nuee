<script setup lang="ts">
import { NoProject } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import ChatHostPicker from '@/components/chat/ChatHostPicker.vue'
import ChatWorktreePicker, { type WorktreeChoice } from '@/components/chat/ChatWorktreePicker.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import type { Project } from '@/stores/projects'

// Ligne au-dessus du champ d'une session vierge, comme Paseo : projet, machine, endroit et branche. Le slot
// `project` remplace le projet affiché par un sélecteur (Nouvel espace de travail).
defineProps<{ chatId: string; project: Project | null; worktree: WorktreeChoice | null }>()
const emit = defineEmits<{ worktree: [choice: string]; base: [branch: string | null]; checkout: [branch: string] }>()

const { t } = useI18n()

const placeBadge =
  'group flex h-7 min-w-0 items-center gap-2 rounded-md px-2 whitespace-nowrap text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-selection-hover aria-expanded:text-content'
</script>

<template>
  <div class="flex min-w-0 items-center gap-1 text-[13px]">
    <slot name="project">
      <p class="flex h-7 min-w-0 items-center gap-2 px-2 text-muted" :title="project?.path">
        <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
        <NoProject v-else class="size-4 shrink-0" aria-hidden="true" />
        <span class="sr-only">{{ t('composer.project') }}</span>
        <span class="truncate">{{ project?.name ?? t('rail.chats') }}</span>
      </p>
    </slot>
    <ChatHostPicker :class="placeBadge" />
    <!-- Comme Paseo : où l'on travaille à gauche, l'endroit et sa branche à droite. -->
    <!-- Une branche au nom long se tronque : la ligne ne passe jamais sur deux lignes. -->
    <div v-if="project && worktree" class="ms-auto flex max-w-1/2 min-w-0 items-center gap-1">
      <ChatWorktreePicker
        :chat-id="chatId"
        :project-path="project.path"
        :worktree="worktree"
        :disabled="false"
        :class="placeBadge"
        @worktree="emit('worktree', $event)"
        @base="emit('base', $event)"
        @checkout="emit('checkout', $event)"
      />
    </div>
  </div>
</template>
