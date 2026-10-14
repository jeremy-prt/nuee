<script setup lang="ts">
import { Archive } from '@/components/ui/icons'
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatIcon from '@/components/chat/ChatIcon.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ShellChatMenu from '@/components/shell/ShellChatMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameInput from '@/components/ui/UiRenameInput.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import { useTabTitle } from '@/composables/useTabTitle'
import { useAttentionStore } from '@/stores/attention'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { agents } from '@/utils/agents'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const attention = useAttentionStore()
const conversations = useConversationsStore()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()
const { tabTitle } = useTabTitle()

const row = useTemplateRef<HTMLButtonElement>('row')
const renaming = ref(false)
const menuOpen = ref(false)
// Lancé au clavier : le focus revient où il était (la ligne, ou le champ de saisie pour ⌘R). À la souris, il
// reste où il tombe.
let returnFocus: HTMLElement | null = null

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
      <UiRenameInput
        v-if="renaming"
        :value="tabTitle(tab)"
        :label="t('chats.renameLabel')"
        @commit="stopRename"
        @cancel="stopRename()"
      >
        <ChatIcon class="size-4 shrink-0 text-muted" />
      </UiRenameInput>
      <template v-else>
        <button
          ref="row"
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          :class="tab.id === workspace.activeTabId ? 'bg-selection' : menuOpen ? 'bg-selection-hover' : 'hover:bg-selection-hover'"
          :aria-current="tab.id === workspace.activeTabId ? 'true' : undefined"
          :aria-keyshortcuts="shortcuts.aria('rename')"
          @click="select"
          @dblclick="startRename()"
          @keydown="onKeydown"
        >
          <ChatSpinner v-if="conversations.working(tab.id)" :agent="tab.agent" class="size-4 text-sm" />
          <ChatIcon v-else class="size-4 shrink-0 text-muted" />
          <span
            class="min-w-0 flex-1 truncate text-start"
            :class="menuOpen ? 'fade-under-two' : 'group-focus-within:fade-under-two group-hover:fade-under-two'"
          >
            {{ tabTitle(tab) }}
          </span>
          <span v-if="attention.isUnseen(tab.id)" class="size-1.5 shrink-0 rounded-full bg-signal">
            <span class="sr-only">{{ t('attention.unseen') }}</span>
          </span>
          <span v-if="conversations.working(tab.id)" class="sr-only">{{ t('chat.working', { agent: agents[tab.agent].name }) }}</span>
        </button>
        <div
          class="absolute end-1 top-1 flex gap-0.5 transition-opacity duration-(--hover-duration) ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
          :class="menuOpen ? 'opacity-100' : 'opacity-0'"
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
      </template>
    </div>
    <template #menu><ShellChatMenu :tab="tab" @rename="startRename()" /></template>
  </UiContextMenu>
</template>
