<script setup lang="ts">
import { ChevronDown, Folder, FolderTree, GitBranch } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatBranchPicker from '@/components/chat/ChatBranchPicker.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'
import type { Project } from '@/stores/projects'

// Tiroir sous le champ de saisie : le projet, l'endroit où l'agent travaille, puis la branche une fois la session
// lancée. L'endroit se choisit jusqu'au premier message ; ensuite le menu le montre, les autres choix grisés.
// `choice` : 'project', 'new' ou le chemin d'un worktree (le sien finit par l'id de la session).
const props = defineProps<{
  chatId: string
  project: Project
  worktree: {
    choice: string
    started: boolean
    blocked: Exclude<WorktreeSupport, 'ready'> | null
    branch: string
    trees: Worktree[]
  } | null
  disabled: boolean
  running: boolean
  focusAfter: () => void
}>()
const emit = defineEmits<{ worktree: [choice: string] }>()

const { t } = useI18n()

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
// Son propre worktree, avant comme après sa création, se lit « Copie isolée » : sa branche est affichée à droite.
const choice = computed(() => {
  const value = props.worktree?.choice ?? 'project'
  return value !== 'project' && (value === 'new' || value.endsWith(props.chatId)) ? 'new' : value
})
const isolated = computed(() => choice.value !== 'project')
const placeLabel = computed(() => {
  if (choice.value === 'project') return t('composer.worktree.project')
  if (choice.value === 'new') return t('composer.worktree.new')
  return props.worktree?.trees.find((tree) => tree.path === choice.value)?.branch ?? folderName(choice.value)
})

const sections = computed<UiMenuSection[]>(() => {
  const worktree = props.worktree
  if (!worktree) return []
  const locked = (value: string) => worktree.started && value !== choice.value
  const main: UiMenuSection = {
    id: 'place',
    value: choice.value,
    options: [
      { value: 'project', label: t('composer.worktree.project'), hint: t('composer.worktree.projectHint'), icon: Folder, disabled: locked('project') },
      { value: 'new', label: t('composer.worktree.new'), hint: t('composer.worktree.newHint'), icon: FolderTree, disabled: locked('new') },
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
  if (!props.worktree?.started) emit('worktree', value)
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  props.focusAfter()
}

const trigger =
  'group flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1.5 whitespace-nowrap text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-selection-hover aria-expanded:text-content'
</script>

<template>
  <div class="mx-3 flex h-8 min-w-0 items-center gap-1 rounded-b-xl border border-t-0 border-stroke bg-content/3 px-1.5 text-xs text-muted">
    <p class="flex min-w-0 shrink items-center gap-1.5 px-1.5" :title="project.path">
      <ProjectIcon :project="project" class="size-3.5 shrink-0" />
      <span class="sr-only">{{ t('composer.project') }}</span>
      <span class="truncate">{{ project.name }}</span>
    </p>
    <template v-if="worktree">
      <span class="text-content/20" aria-hidden="true">/</span>
      <UiTooltip :label="worktree.blocked ? t(`settings.projects.worktreeSupport.${worktree.blocked}`) : t('composer.worktree.menu')">
        <span class="flex min-w-0">
          <DropdownMenuRoot>
            <DropdownMenuTrigger :disabled="!!worktree.blocked || disabled" :class="trigger">
              <span class="sr-only">{{ t('composer.worktree.menu') }}</span>
              <component :is="isolated ? FolderTree : Folder" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ placeLabel }}</span>
              <ChevronDown
                class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                side="top"
                align="start"
                :side-offset="6"
                :collision-padding="8"
                :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-64']"
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
      <span v-if="worktree.started" class="ms-auto flex min-w-0 shrink-0">
        <ChatBranchPicker :key="chatId" :chat-id="chatId" :project="project" :fallback="worktree.branch" :disabled="disabled || running" />
      </span>
    </template>
  </div>
</template>
