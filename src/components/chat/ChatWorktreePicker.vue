<script lang="ts">
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'

// `choice` : 'project', 'new' ou le chemin d'un worktree de `trees` (le sien finit par l'id de la session) ;
// `blocked` : pourquoi il est impossible.
export interface WorktreeChoice {
  choice: string
  started: boolean
  blocked: Exclude<WorktreeSupport, 'ready'> | null
  branch: string
  trees: Worktree[]
}
</script>

<script setup lang="ts">
import { ChevronDown, Folder, FolderTree, GitBranch } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'

// Où l'agent travaille : en local, dans un nouveau worktree ou dans un worktree existant. Se choisit jusqu'au premier
// message ; ensuite le menu le montre, les autres choix grisés.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ chatId: string; worktree: WorktreeChoice; disabled: boolean; side?: 'top' | 'bottom'; focusAfter?: () => void }>()
const emit = defineEmits<{ worktree: [choice: string] }>()

const { t } = useI18n()

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
// Son propre worktree, avant comme après sa création, se lit « Nouveau worktree » : sa branche est affichée à part.
const choice = computed(() => {
  const value = props.worktree.choice
  return value !== 'project' && (value === 'new' || value.endsWith(props.chatId)) ? 'new' : value
})
const isolated = computed(() => choice.value !== 'project')
const label = computed(() => {
  if (choice.value === 'project') return t('composer.worktree.project')
  if (choice.value === 'new') return t('composer.worktree.new')
  return props.worktree.trees.find((tree) => tree.path === choice.value)?.branch ?? folderName(choice.value)
})

const sections = computed<UiMenuSection[]>(() => {
  const worktree = props.worktree
  const locked = (value: string) => worktree.started && value !== choice.value
  const main: UiMenuSection = {
    id: 'place',
    value: choice.value,
    options: [
      { value: 'project', label: t('composer.worktree.project'), icon: Folder, disabled: locked('project') },
      { value: 'new', label: t('composer.worktree.new'), icon: FolderTree, disabled: locked('new') },
    ],
  }
  if (!worktree.trees.length) return [main]
  return [
    main,
    {
      id: 'existing',
      label: t('composer.worktree.existing'),
      value: choice.value,
      options: worktree.trees.map((tree) => ({
        value: tree.path,
        label: tree.branch ?? folderName(tree.path),
        icon: GitBranch,
        disabled: locked(tree.path),
      })),
    },
  ]
})

function choose(value: string) {
  if (!props.worktree.started) emit('worktree', value)
}

function onCloseAutoFocus(event: Event) {
  if (!props.focusAfter) return
  event.preventDefault()
  props.focusAfter()
}
</script>

<template>
  <UiTooltip :label="worktree.blocked ? t(`settings.projects.worktreeSupport.${worktree.blocked}`) : t('composer.worktree.menu')">
    <span class="flex min-w-0">
      <DropdownMenuRoot>
        <DropdownMenuTrigger :disabled="!!worktree.blocked || disabled" v-bind="$attrs">
          <span class="sr-only">{{ t('composer.worktree.menu') }}</span>
          <component :is="isolated ? FolderTree : Folder" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ label }}</span>
          <ChevronDown
            class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            :side="side ?? 'top'"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-72']"
            @close-auto-focus="onCloseAutoFocus"
          >
            <DropdownMenuLabel :class="menuTitle">{{ t('composer.worktree.menu') }}</DropdownMenuLabel>
            <template v-for="(section, index) in sections" :key="section.id">
              <DropdownMenuLabel v-if="index > 0" :class="[menuTitle, 'mt-1']">{{ section.label }}</DropdownMenuLabel>
              <UiMenuChoices :section="section" @select="choose" />
            </template>
            <p v-if="worktree.started" class="px-2 pt-1.5 pb-1 text-[11px] leading-4 text-muted">{{ t('composer.worktree.locked') }}</p>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
