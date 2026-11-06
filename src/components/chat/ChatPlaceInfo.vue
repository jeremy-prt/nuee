<script setup lang="ts">
import { Folder, FolderTree, GitBranch } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorktreesStore } from '@/stores/worktrees'
import type { Tab } from '@/stores/workspace'

// Où travaille une session lancée : simple rappel, l'endroit et la branche ne changent plus en cours de conversation.
const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const worktrees = useWorktreesStore()

const branch = computed(() => worktrees.branchOf(props.tab))
const path = computed(() => (props.tab.worktree ? (props.tab.worktreePath ?? undefined) : undefined))
</script>

<template>
  <p class="flex min-w-0 items-center gap-1.5 px-2 text-xs text-muted" :title="path">
    <component :is="tab.worktree ? FolderTree : Folder" class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="shrink-0">{{ tab.worktree ? t('composer.worktree.short') : t('composer.worktree.project') }}</span>
    <template v-if="branch">
      <span class="text-content/20" aria-hidden="true">·</span>
      <GitBranch class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('composer.branch.label') }}</span>
      <span class="truncate">{{ branch }}</span>
    </template>
  </p>
</template>
