<script setup lang="ts">
import { CloudDownload, GitBranch } from '@/components/ui/icons'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiMenu from '@/components/ui/UiMenu.vue'
import { useGitActions } from '@/composables/useGitActions'
import { useSessionBranch } from '@/composables/useSessionBranch'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useGitActionsStore } from '@/stores/gitActions'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'

// Branche du dossier de la session, en tête des deux modes du volet Git (menu pour en changer quand c'est possible,
// comme Environnement). Slot : ce qui s'affiche à droite (total des changements), puis le pull direct, avec une
// pastille quand la branche suivie a des commits à récupérer.
const { t } = useI18n()
const { chat } = useTerminalChat()
const { idle, run } = useGitActions()
const gitActions = useGitActionsStore()
const { branch, place, canSwitch, branchList, loadBranches, checkout } = useSessionBranch()
const committing = computed(() => gitActions.manual.has(gitActions.folderOf(chat.value) ?? ''))

watch([place, branch], () => loadBranches(), { immediate: true })

const sessionGit = useSessionGitStore()
const projects = useProjectsStore()
const path = computed(() => projects.byId(chat.value?.projectId ?? null)?.path ?? null)
const behind = computed(() => (chat.value ? (sessionGit.behind[chat.value.id] ?? 0) : 0))
watch(
  [() => chat.value?.id, path],
  ([id, root]) => {
    if (id && root) sessionGit.checkBehind(id, root)
  },
  { immediate: true },
)
const pullLabel = computed(() => (behind.value ? t('dock.changes.pullBehind', { n: behind.value }, behind.value) : t('dock.changes.pull')))
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
    <UiIconButton
      v-if="chat?.started"
      :label="pullLabel"
      :disabled="!idle || !!run || committing"
      class="relative -me-1 size-6!"
      @click="chat && gitActions.pullNow(chat)"
    >
      <CloudDownload class="size-3" aria-hidden="true" />
      <span v-if="behind" class="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-signal" aria-hidden="true" />
    </UiIconButton>
  </div>
</template>
