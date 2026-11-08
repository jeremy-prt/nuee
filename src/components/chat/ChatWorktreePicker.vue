<script lang="ts">
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'

// `choice` : 'project', 'new' ou le chemin d'un worktree partagé (rejoint depuis Réglages › Worktrees).
// `blocked` : pourquoi un worktree est impossible. `current` : branche du dossier du projet ; `base` : celle d'où part
// un nouveau worktree (null : `current`).
export interface WorktreeChoice {
  choice: string
  blocked: Exclude<WorktreeSupport, 'ready'> | null
  trees: Worktree[]
  current: string | null
  base: string | null
}
</script>

<script setup lang="ts">
import { ChevronDown, Folder, FolderTree, GitBranch } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import type { Branch } from '@/ipc/bindings/Branch'
import { worktreeRefs } from '@/ipc/worktree'

// Où l'agent travaille, avant le premier message : le dossier du projet (sur la branche choisie, git y bascule) ou un
// nouveau worktree (depuis la branche choisie). Un worktree partagé ne s'ajoute que s'il est déjà choisi, ouvert depuis ses réglages.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ chatId: string; projectPath: string; worktree: WorktreeChoice; disabled: boolean }>()
const emit = defineEmits<{ worktree: [choice: string]; base: [branch: string | null]; checkout: [branch: string] }>()

const { t } = useI18n()
const branches = ref<Branch[]>([])

async function loadBranches(open: boolean) {
  if (!open) return
  try {
    branches.value = (await worktreeRefs(props.chatId, props.projectPath)).branches
  } catch {
    branches.value = []
  }
}

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
// Son propre worktree, avant comme après sa création, se lit « Nouveau worktree ».
const choice = computed(() => {
  const value = props.worktree.choice
  return value !== 'project' && (value === 'new' || value.endsWith(props.chatId)) ? 'new' : value
})
const shared = computed(() => (choice.value === 'project' || choice.value === 'new' ? null : choice.value))
const sharedLabel = computed(() =>
  shared.value ? (props.worktree.trees.find((tree) => tree.path === shared.value)?.branch ?? folderName(shared.value)) : '',
)
const start = computed(() => props.worktree.base ?? props.worktree.current)
// L'endroit et sa branche dans un seul bouton : « Local · main », « Worktree · main » (depuis main).
const label = computed(() => {
  if (shared.value) return sharedLabel.value
  const place = choice.value === 'project' ? t('composer.worktree.project') : t('composer.worktree.short')
  const branch = choice.value === 'project' ? props.worktree.current : start.value
  return branch ? `${place} · ${branch}` : place
})

const shares = computed<UiMenuSection>(() => ({
  id: 'shared',
  value: choice.value,
  options: shared.value ? [{ value: shared.value, label: sharedLabel.value, icon: GitBranch }] : [],
}))
const known = computed(() =>
  branches.value.length ? branches.value : props.worktree.current ? [{ name: props.worktree.current, elsewhere: false }] : [],
)
// Une branche prise par un worktree n'est pas proposée au dossier du projet : git refuse de l'y extraire.
const locals = computed<UiMenuSection>(() => ({
  id: 'local',
  value: choice.value === 'project' ? (props.worktree.current ?? '') : '',
  options: known.value.filter((branch) => !branch.elsewhere).map((branch) => ({ value: branch.name, label: branch.name, icon: GitBranch })),
}))
const starts = computed<UiMenuSection>(() => ({
  id: 'base',
  value: choice.value === 'new' ? (start.value ?? '') : '',
  options: known.value.map((branch) => ({ value: branch.name, label: branch.name, icon: GitBranch })),
}))

function chooseLocal(branch: string) {
  emit('worktree', 'project')
  if (branch !== props.worktree.current) emit('checkout', branch)
}

function chooseStart(branch: string) {
  emit('worktree', 'new')
  emit('base', branch === props.worktree.current ? null : branch)
}
</script>

<template>
  <UiTooltip :label="worktree.blocked ? t(`settings.projects.worktreeSupport.${worktree.blocked}`) : t('composer.worktree.menu')">
    <span class="flex min-w-0">
      <DropdownMenuRoot :modal="false" @update:open="loadBranches">
        <DropdownMenuTrigger :disabled="!!worktree.blocked || disabled" v-bind="$attrs">
          <span class="sr-only">{{ t('composer.worktree.menu') }}</span>
          <component :is="choice === 'project' ? Folder : FolderTree" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ label }}</span>
          <ChevronDown
            class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent side="bottom" align="end" :side-offset="6" :collision-padding="8" :class="[menuPanel, 'w-60']">
            <DropdownMenuLabel :class="menuTitle">{{ t('composer.worktree.menu') }}</DropdownMenuLabel>
            <UiMenuSub :label="t('composer.worktree.project')" :icon="Folder" :value="choice === 'project' ? (worktree.current ?? undefined) : undefined">
              <DropdownMenuLabel :class="menuTitle">{{ t('composer.branch.label') }}</DropdownMenuLabel>
              <UiMenuChoices :section="locals" @select="chooseLocal" />
            </UiMenuSub>
            <UiMenuChoices v-if="shared" :section="shares" @select="emit('worktree', $event)" />
            <UiMenuSub :label="t('composer.worktree.new')" :icon="FolderTree" :value="choice === 'new' ? (start ?? undefined) : undefined">
              <DropdownMenuLabel :class="menuTitle">{{ t('composer.branch.base') }}</DropdownMenuLabel>
              <UiMenuChoices :section="starts" @select="chooseStart" />
            </UiMenuSub>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
