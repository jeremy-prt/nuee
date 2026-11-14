<script setup lang="ts">
import { ChevronDown, Pin } from '@/components/ui/icons'
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
// Comme T3 Code : une session au repos passe en « Inactives » après 7 jours sans activité.
const IDLE_AFTER = 7 * 86_400_000
type StatusGroup = 'waiting' | 'failed' | 'working' | 'done' | 'idle'
const STATUS_RANK: Record<StatusGroup, number> = { waiting: 0, failed: 1, working: 2, done: 3, idle: 4 }

function statusGroup(tab: Tab): StatusGroup {
  const status = sessionStatus(tab.id)
  if (status === 'approval' || status === 'question') return 'waiting'
  if (status) return status
  return clock.now - tab.updatedAt < IDLE_AFTER ? 'done' : 'idle'
}

// En groupage par statut, les sessions actives passent devant avant le découpage progressif : jamais cachées plus bas.
const recent = computed(() => {
  const list = sorted(workspace.recentChats)
  if (layout.sessionGroups !== 'status') return list
  return list.sort((a, b) => STATUS_RANK[statusGroup(a)] - STATUS_RANK[statusGroup(b)])
})
const { shown: recentShown, more, limit, sentinel } = useProgressiveList(recent, () => navigation.projectId)

type GroupId = `${DateGroup}` | `status.${StatusGroup}`

// Intertitres sur demande (menu de tri) ; ceux de date jamais en tri par nom, ils couperaient l'ordre alphabétique.
const groupOf = computed<((tab: Tab) => GroupId) | null>(() => {
  const key = dateKey.value
  if (layout.sessionGroups === 'status') return (tab) => `status.${statusGroup(tab)}`
  if (layout.sessionGroups === 'date' && key) return (tab) => dateGroup(tab[key], clock.now)
  return null
})

const groups = computed(() => {
  const of = groupOf.value
  if (!of) return [{ id: null, tabs: recentShown.value }]
  const result: { id: GroupId | null; tabs: Tab[] }[] = []
  for (const tab of recentShown.value) {
    const id = of(tab)
    const last = result.at(-1)
    if (last?.id === id) last.tabs.push(tab)
    else result.push({ id, tabs: [tab] })
  }
  return result
})

// Compté sur toute la liste, pas seulement la part déjà affichée.
const counts = computed(() => {
  const result = new Map<GroupId, number>()
  const of = groupOf.value
  if (!of) return result
  for (const tab of recent.value) {
    const id = of(tab)
    result.set(id, (result.get(id) ?? 0) + 1)
  }
  return result
})

const isCollapsed = (id: GroupId) => layout.collapsedGroups.includes(id)
function toggleGroup(id: GroupId) {
  layout.collapsedGroups = isCollapsed(id) ? layout.collapsedGroups.filter((other) => other !== id) : [...layout.collapsedGroups, id]
}

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
      <h2 class="flex h-7 items-center gap-1.5 px-2 text-xs font-semibold text-muted">
        <Pin class="size-3" aria-hidden="true" />{{ t('chats.pinned') }}
      </h2>
      <ul class="space-y-0.5">
        <li v-for="tab in pinned" :key="tab.id" :data-chat-id="tab.id"><ShellChatGroup :tab="tab" /></li>
      </ul>
    </div>
    <div data-chat-zone="recent">
      <template v-for="(group, index) in groups" :key="group.id ?? 'all'">
        <h2 v-if="group.id" :class="{ 'mt-4': index || pinned.length }">
          <button
            type="button"
            class="group/head flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted hover:text-content/75 focus-visible:outline-2 focus-visible:outline-ring"
            :aria-expanded="!isCollapsed(group.id)"
            :aria-controls="`chat-group-${group.id}`"
            @click="toggleGroup(group.id)"
          >
            <span class="min-w-0 truncate text-start">{{ t(`chats.groups.${group.id}`) }}</span>
            <span class="flex-1 text-start font-normal text-muted/70 tabular-nums">{{ counts.get(group.id) }}</span>
            <!-- Flèche au survol seulement : au repos, le titre et son nombre suffisent. -->
            <ChevronDown
              class="size-3 shrink-0 text-muted opacity-0 transition duration-150 group-hover/head:opacity-100 group-focus-visible/head:opacity-100 motion-reduce:transition-none"
              :class="{ '-rotate-90 rtl:rotate-90': isCollapsed(group.id) }"
              aria-hidden="true"
            />
          </button>
        </h2>
        <!-- Tri par nom : un titre seulement pour séparer des épinglées, et pas deux « Sessions » de suite. -->
        <template v-else-if="pinned.length && group.tabs.length">
          <h2 class="mt-4 flex h-7 items-center px-2 text-xs font-semibold text-muted">{{ t('chats.recent') }}</h2>
        </template>
        <ul v-if="!group.id || !isCollapsed(group.id)" :id="group.id ? `chat-group-${group.id}` : undefined" class="space-y-0.5">
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
