<script setup lang="ts">
import { Pin } from '@/components/ui/icons'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatGroup from '@/components/shell/ShellChatGroup.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useSessionStatus } from '@/composables/useSessionStatus'
import { useTabTitle } from '@/composables/useTabTitle'
import { useClockStore } from '@/stores/clock'
import { useDragStore } from '@/stores/drag'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { type DateGroup, dateGroup } from '@/utils/duration'

// Sessions du projet en cours (ou du Chat sans projet) : panneau latéral, ou barre latérale en « Projets en menu ».

const { t, locale } = useI18n()
const clock = useClockStore()
const drag = useDragStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const { tabTitle } = useTabTitle()
const sessionStatus = useSessionStatus()

const dateKey = computed(() => (layout.sessionSort === 'created' ? 'createdAt' : layout.sessionSort === 'activity' ? 'updatedAt' : null))

function sorted(list: Tab[]) {
  const key = dateKey.value
  if (key) return [...list].sort((a, b) => b[key] - a[key])
  const collator = new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' })
  return [...list].sort((a, b) => collator.compare(tabTitle(a), tabTitle(b)))
}

// Ordre choisi au glisser d'abord, puis les autres selon le tri.
const pinned = computed(() => {
  const rank = (tab: Tab) => {
    const index = layout.pinnedOrder.indexOf(tab.id)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  return sorted(workspace.pinnedChats).sort((a, b) => rank(a) - rank(b))
})
// « Terminées » : fin pas encore vue ; une fois la session ouverte, elle passe en « Inactives ».
type StatusGroup = 'waiting' | 'failed' | 'working' | 'done' | 'idle'
const STATUS_RANK: Record<StatusGroup, number> = { waiting: 0, failed: 1, working: 2, done: 3, idle: 4 }

function statusGroup(tab: Tab): StatusGroup {
  const status = sessionStatus(tab.id)
  if (status === 'approval' || status === 'question') return 'waiting'
  return status ?? 'idle'
}

// En groupage par statut, les sessions actives passent devant avant le découpage progressif : jamais cachées plus bas.
const recent = computed(() => {
  const list = sorted(workspace.recentChats)
  if (layout.sessionGroups !== 'status') return list
  return list.sort((a, b) => STATUS_RANK[statusGroup(a)] - STATUS_RANK[statusGroup(b)])
})
const { shown: recentShown, more, limit, sentinel } = useProgressiveList(recent, () => navigation.projectId)

// Intertitres sur demande (menu de tri) ; ceux de date jamais en tri par nom, ils couperaient l'ordre alphabétique.
const groups = computed(() => {
  const key = dateKey.value
  const mode = layout.sessionGroups
  if (mode === 'none' || (mode === 'date' && !key)) return [{ id: null, tabs: recentShown.value }]
  const result: { id: `${DateGroup}` | `status.${StatusGroup}` | null; tabs: Tab[] }[] = []
  for (const tab of recentShown.value) {
    const id = mode === 'status' ? (`status.${statusGroup(tab)}` as const) : dateGroup(tab[key!], clock.now)
    const last = result.at(-1)
    if (last?.id === id) last.tabs.push(tab)
    else result.push({ id, tabs: [tab] })
  }
  return result
})

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
  <div v-if="workspace.contextChats.length" data-chat-list>
    <!-- Sans épinglée, la section n'apparaît que pendant le glisser d'une session, pour l'y déposer. -->
    <div v-if="pinned.length || drag.source?.kind === 'chat'" data-chat-zone="pinned">
      <h2 class="flex h-7 items-center gap-1.5 px-2 text-[11px] text-muted">
        <Pin class="size-3" aria-hidden="true" />{{ t('chats.pinned') }}
      </h2>
      <ul class="space-y-0.5">
        <li v-for="tab in pinned" :key="tab.id" :data-chat-id="tab.id"><ShellChatGroup :tab="tab" /></li>
      </ul>
    </div>
    <div data-chat-zone="recent">
      <template v-for="(group, index) in groups" :key="group.id ?? 'all'">
        <h2
          v-if="group.id"
          class="flex h-7 items-center px-2 text-[11px] text-muted"
          :class="{ 'mt-3': index || pinned.length }"
        >
          {{ t(`chats.groups.${group.id}`) }}
        </h2>
        <!-- Tri par nom : un titre seulement pour séparer des épinglées, et pas deux « Sessions » de suite. -->
        <template v-else-if="pinned.length && group.tabs.length">
          <h2 class="mt-3 flex h-7 items-center px-2 text-[11px] text-muted">{{ t('chats.recent') }}</h2>
        </template>
        <ul class="space-y-0.5">
          <li v-for="tab in group.tabs" :key="tab.id" :data-chat-id="tab.id"><ShellChatGroup :tab="tab" /></li>
        </ul>
      </template>
    </div>
    <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
  </div>
  <p v-else class="px-2 text-sm text-muted">
    {{ t('chats.empty') }}
  </p>
</template>
