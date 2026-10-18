<script setup lang="ts">
import { Archive, CircleAlert, CircleCheck, GitBranch, ShieldQuestion } from '@/components/ui/icons'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import ShellChatMenu from '@/components/shell/ShellChatMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameField from '@/components/ui/UiRenameField.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import { useTabTitle } from '@/composables/useTabTitle'
import { useAttentionStore } from '@/stores/attention'
import { useCatalogStore } from '@/stores/catalog'
import { useClockStore } from '@/stores/clock'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { agents } from '@/utils/agents'
import { formatSince } from '@/utils/duration'

const props = defineProps<{ tab: Tab }>()

const { t, locale } = useI18n()
const attention = useAttentionStore()
const catalog = useCatalogStore()
const clock = useClockStore()
const conversations = useConversationsStore()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const actions = useProjectActions()
const { tabTitle } = useTabTitle()

catalog.load(props.tab.agent)

const row = useTemplateRef<HTMLElement>('row')
const renaming = ref(false)
const menuOpen = ref(false)
// Lancé au clavier : le focus revient où il était (la ligne, ou le champ de saisie pour ⌘R). À la souris, il
// reste où il tombe.
let returnFocus: HTMLElement | null = null

const active = computed(() => props.tab.id === workspace.activeTabId)

// Du plus pressant au moins pressant. Sans état, la carte donne l'heure de la dernière activité.
const status = computed(() => {
  if (conversations.find(props.tab.id)?.approvals.length) return 'approval'
  if (conversations.working(props.tab.id)) return 'working'
  const signal = attention.unseenSignal(props.tab.id)
  return signal === 'done' || signal === 'failed' ? signal : null
})
const statusColor = { approval: 'text-warning', working: 'text-signal-text', done: 'text-success', failed: 'text-danger' }

const since = computed(() => formatSince(props.tab.updatedAt, clock.now, locale.value))
const branch = computed(() => worktrees.branchOf(props.tab))
const model = computed(() => catalog.modelLabel(props.tab.agent, props.tab.model))
const diff = computed(() => (props.tab.added || props.tab.removed ? { added: props.tab.added, removed: props.tab.removed } : null))

// Au survol, les boutons se posent à droite de la dernière ligne (la branche, sinon le titre) : le texte s'estompe
// dessous et le diff leur laisse la place.
const fadeUnder = computed(() => (menuOpen.value ? 'fade-under-two' : 'group-focus-within:fade-under-two group-hover:fade-under-two'))
const hideUnder = computed(() => (menuOpen.value ? 'hidden' : 'group-focus-within:hidden group-hover:hidden'))

// Le chat peut venir d'un autre contexte (recherche) : on bascule d'abord sur son projet.
function select() {
  navigation.openChats(props.tab.projectId)
  workspace.show(props.tab.id)
}

function startRename(from: HTMLElement | null = null) {
  returnFocus = from
  renaming.value = true
}

async function stopRename(title?: string) {
  renaming.value = false
  if (title) await actions.renameChat(props.tab, title)
  if (!returnFocus) return
  await nextTick()
  ;(returnFocus.isConnected ? returnFocus : row.value)?.focus()
}

// ⌘R sur une ligne qui a le focus la renomme, elle, plutôt que la session en cours.
function onKeydown(event: KeyboardEvent) {
  if (!shortcuts.matches(event, 'rename')) return
  event.preventDefault()
  event.stopPropagation()
  startRename(row.value)
}

watch(
  () => workspace.renamingId,
  (id) => {
    if (id !== props.tab.id) return
    workspace.renamingId = null
    startRename(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  },
)
</script>

<template>
  <UiContextMenu :disabled="renaming" @update:open="menuOpen = $event">
    <div class="group relative">
      <!-- En renommage, la carte devient un simple cadre : le champ prend la place du titre, rien d'autre ne bouge. -->
      <component
        :is="renaming ? 'div' : 'button'"
        ref="row"
        :type="renaming ? undefined : 'button'"
        class="flex w-full flex-col gap-1 rounded-md p-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :class="renaming || active ? 'bg-selection' : menuOpen ? 'bg-selection-hover' : 'hover:bg-selection-hover'"
        :aria-current="active && !renaming ? 'true' : undefined"
        :aria-keyshortcuts="renaming ? undefined : shortcuts.aria('rename')"
        v-on="renaming ? {} : { click: select, dblclick: () => startRename(), keydown: onKeydown }"
      >
        <span class="flex h-4 items-center gap-1.5 text-[11px] text-muted">
          <SettingsAgentLogo :id="tab.agent" small class="-my-0.5 -ms-0.5 -me-0.5" />
          <span class="min-w-0 flex-1 truncate">{{ model ?? agents[tab.agent].name }}</span>
          <span v-if="status" class="flex shrink-0 items-center gap-1" :class="statusColor[status]">
            <ChatSpinner v-if="status === 'working'" :agent="tab.agent" inherit class="text-xs" />
            <ShieldQuestion v-else-if="status === 'approval'" class="size-3" aria-hidden="true" />
            <CircleCheck v-else-if="status === 'done'" class="size-3" aria-hidden="true" />
            <CircleAlert v-else class="size-3" aria-hidden="true" />
            {{ t(`chats.status.${status}`) }}
          </span>
          <span v-else class="shrink-0">{{ since }}</span>
        </span>
        <span class="flex items-center gap-1.5">
          <UiRenameField
            v-if="renaming"
            :value="tabTitle(tab)"
            :label="t('chats.renameLabel')"
            class="-my-0.5 flex-1 text-[13px] font-medium"
            @commit="stopRename"
            @cancel="stopRename()"
          />
          <span v-else class="min-w-0 flex-1 truncate text-[13px]/5 font-medium" :class="{ [fadeUnder]: !branch }">{{ tabTitle(tab) }}</span>
          <ChatDiffStat v-if="!branch && diff && !renaming" v-bind="diff" plain class="text-[11px]" :class="hideUnder" />
        </span>
        <span v-if="branch" class="flex h-4 items-center gap-1.5 text-[11px] text-muted">
          <span class="flex min-w-0 flex-1 items-center gap-1" :class="fadeUnder">
            <GitBranch class="size-3 shrink-0" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ branch }}</span>
          </span>
          <ChatDiffStat v-if="diff" v-bind="diff" plain :class="hideUnder" />
        </span>
      </component>
      <div
        v-if="!renaming"
        class="absolute end-1 flex gap-0.5 transition-opacity duration-(--hover-duration) ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
        :class="[menuOpen ? 'opacity-100' : 'opacity-0', branch ? 'bottom-1' : 'bottom-1.5']"
      >
        <UiTooltip :label="t('chats.archive')">
          <button
            type="button"
            class="grid size-6 place-items-center rounded text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('chats.archive')"
            @click="actions.archiveChat(tab)"
          >
            <Archive class="size-3.5" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiMoreMenu :label="t('menu.more')" :keep-focus="() => renaming" @update:open="menuOpen = $event">
          <ShellChatMenu :tab="tab" @rename="startRename()" />
        </UiMoreMenu>
      </div>
    </div>
    <template #menu><ShellChatMenu :tab="tab" @rename="startRename()" /></template>
  </UiContextMenu>
</template>
