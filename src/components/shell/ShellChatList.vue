<script setup lang="ts">
import { Pin } from '@/components/ui/icons'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTabTitle } from '@/composables/useTabTitle'
import { useClockStore } from '@/stores/clock'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { type DateGroup, dateGroup } from '@/utils/duration'

// Sessions du projet en cours (ou du Chat sans projet) : panneau latéral, ou barre latérale en « Projets en menu ».
// `titled` : l'en-tête au-dessus de la liste (ShellRail) prend le premier intertitre, comme monocode, plutôt que
// d'afficher « Sessions » puis « Aujourd'hui ».
const props = defineProps<{ titled?: boolean }>()

const { t, locale } = useI18n()
const shortcuts = useShortcutsStore()
const clock = useClockStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const { tabTitle } = useTabTitle()

const dateKey = computed(() => (layout.sessionSort === 'created' ? 'createdAt' : layout.sessionSort === 'activity' ? 'updatedAt' : null))

function sorted(list: Tab[]) {
  const key = dateKey.value
  if (key) return [...list].sort((a, b) => b[key] - a[key])
  const collator = new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' })
  return [...list].sort((a, b) => collator.compare(tabTitle(a), tabTitle(b)))
}

const pinned = computed(() => sorted(workspace.pinnedChats))
const { shown: recentShown, more, limit, sentinel } = useProgressiveList(
  computed(() => sorted(workspace.recentChats)),
  () => navigation.projectId,
)

// Intertitres de date, sauf en tri par nom où ils couperaient l'ordre alphabétique.
const groups = computed(() => {
  const key = dateKey.value
  if (!key) return [{ id: null, tabs: recentShown.value }]
  const result: { id: DateGroup | null; tabs: Tab[] }[] = []
  for (const tab of recentShown.value) {
    const id = dateGroup(tab[key], clock.now)
    const last = result.at(-1)
    if (last?.id === id) last.tabs.push(tab)
    else result.push({ id, tabs: [tab] })
  }
  return result
})

const heading = computed(() => {
  if (pinned.value.length) return t('chats.pinned')
  const first = groups.value[0]?.id
  return first ? t(`chats.groups.${first}`) : t('chats.recent')
})
defineExpose({ heading })

// Branches des sessions : relues à chaque arrivée sur le projet, une branche a pu changer hors de Nuée.
watch(
  () => projects.byId(navigation.projectId),
  (project) => {
    if (project) worktrees.load(project)
  },
  { immediate: true },
)
</script>

<template>
  <template v-if="workspace.contextChats.length">
    <template v-if="pinned.length">
      <h2 v-if="!titled" class="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
        <Pin class="size-3" aria-hidden="true" />{{ t('chats.pinned') }}
      </h2>
      <ul class="space-y-0.5">
        <li v-for="tab in pinned" :key="tab.id"><ShellChatItem :tab="tab" /></li>
      </ul>
    </template>
    <template v-for="(group, index) in groups" :key="group.id ?? 'all'">
      <h2
        v-if="group.id && (index || pinned.length || !props.titled)"
        class="flex h-7 items-center px-2 text-xs font-medium text-muted"
        :class="{ 'mt-3': index || pinned.length }"
      >
        {{ t(`chats.groups.${group.id}`) }}
      </h2>
      <!-- Tri par nom : un titre seulement pour séparer des épinglées, et pas deux « Sessions » de suite. -->
      <template v-else-if="pinned.length && group.tabs.length">
        <h2 v-if="!titled" class="mt-3 flex h-7 items-center px-2 text-xs font-medium text-muted">{{ t('chats.recent') }}</h2>
        <div v-else class="mx-2 my-2 h-px bg-stroke" />
      </template>
      <ul class="space-y-0.5">
        <li v-for="tab in group.tabs" :key="tab.id"><ShellChatItem :tab="tab" /></li>
      </ul>
    </template>
    <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
  </template>
  <p v-else class="px-2 text-sm text-muted">
    {{ shortcuts.label('newChat') ? t('chats.empty', { shortcut: shortcuts.label('newChat') }) : t('chats.emptyNoShortcut') }}
  </p>
</template>
