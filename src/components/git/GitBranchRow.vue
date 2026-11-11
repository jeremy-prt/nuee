<script setup lang="ts">
import { GitBranch } from '@/components/ui/icons'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiMenu from '@/components/ui/UiMenu.vue'
import { useGitActions } from '@/composables/useGitActions'
import { useSessionBranch } from '@/composables/useSessionBranch'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useGitActionsStore } from '@/stores/gitActions'

// Branche du dossier de la session, en tête des deux modes du volet Git (menu pour en changer quand c'est possible,
// comme Environnement). Slot : ce qui s'affiche à droite (total des changements).
const { t } = useI18n()
const { chat } = useTerminalChat()
const { idle, run } = useGitActions()
const gitActions = useGitActionsStore()
const { branch, place, canSwitch, branchList, loadBranches, checkout } = useSessionBranch()
const committing = computed(() => gitActions.manual.has(gitActions.folderOf(chat.value) ?? ''))

watch([place, branch], () => loadBranches(), { immediate: true })
const sections = computed(() => [
  {
    id: 'branch',
    label: t('composer.branch.label'),
    value: branch.value ?? '',
    options: branchList.value.map((item) => ({ value: item.name, label: item.name, icon: GitBranch })),
  },
])
</script>

<template>
  <div class="flex h-7 min-w-0 items-center gap-2 pe-2">
    <UiMenu
      v-if="canSwitch"
      :label="t('composer.branch.label')"
      :sections="sections"
      :disabled="!idle || !!run || committing"
      side="bottom"
      look="h-7 max-w-full px-2 text-content hover:bg-selection-hover aria-expanded:bg-selection-hover"
      @select="(_, name) => checkout(name)"
    >
      <GitBranch class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ branch }}</span>
    </UiMenu>
    <p v-else class="flex min-w-0 items-center gap-1.5 px-2 text-xs" :class="{ 'text-muted': !branch }">
      <GitBranch class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span class="sr-only">{{ t('composer.branch.label') }}</span>
      <span class="min-w-0 truncate">{{ branch ?? t('dock.session.noBranch') }}</span>
    </p>
    <span class="flex-1" />
    <slot />
  </div>
</template>
