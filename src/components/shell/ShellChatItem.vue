<script setup lang="ts">
import { MessageSquare, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useTabTitle } from '@/composables/useTabTitle'
import { useAttentionStore } from '@/stores/attention'
import { useDialogStore } from '@/stores/dialog'
import { useGeneralStore } from '@/stores/general'
import { useNavigationStore } from '@/stores/navigation'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const attention = useAttentionStore()
const dialog = useDialogStore()
const general = useGeneralStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

// Le chat peut venir d'un autre contexte (recherche) : on bascule d'abord sur son projet.
function select() {
  navigation.openChats(props.tab.projectId)
  workspace.show(props.tab.id)
}

async function remove() {
  const confirmed =
    !general.confirmDelete ||
    (await dialog.confirm({
      title: t('chats.deleteTitle'),
      message: t('chats.deleteMessage', { title: tabTitle(props.tab) }),
      confirmLabel: t('chats.deleteConfirm'),
      danger: true,
    }))
  if (confirmed) workspace.deleteChat(props.tab.id)
}
</script>

<template>
  <div class="group relative">
    <button
      type="button"
      class="flex h-8 w-full items-center gap-2 rounded-md ps-2 pe-8 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :class="props.tab.id === workspace.activeTabId ? 'bg-selection' : 'hover:bg-selection-hover'"
      :aria-current="props.tab.id === workspace.activeTabId ? 'true' : undefined"
      @click="select"
    >
      <MessageSquare class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <span class="truncate">{{ tabTitle(props.tab) }}</span>
      <span v-if="attention.isUnseen(props.tab.id)" class="ms-auto size-1.5 shrink-0 rounded-full bg-accent">
        <span class="sr-only">{{ t('attention.unseen') }}</span>
      </span>
    </button>
    <button
      type="button"
      class="absolute end-1 top-1 grid size-6 place-items-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-selection-hover hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
      :aria-label="t('chats.delete')"
      :title="t('chats.delete')"
      @click="remove"
    >
      <Trash2 class="size-3.5" aria-hidden="true" />
    </button>
  </div>
</template>
