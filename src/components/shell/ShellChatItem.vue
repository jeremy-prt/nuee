<script setup lang="ts">
import { MessageSquare, Trash2 } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTabTitle } from '@/composables/useTabTitle'
import { useNavigationStore } from '@/stores/navigation'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

// Supprimer efface l'historique pour de bon : un premier clic arme, le second confirme.
const confirming = ref(false)
let disarm = 0

// Le chat peut venir d'un autre contexte (recherche) : on bascule d'abord sur son projet.
function select() {
  navigation.openChats(props.tab.projectId)
  workspace.show(props.tab.id)
}

function remove() {
  if (confirming.value) {
    workspace.deleteChat(props.tab.id)
    return
  }
  confirming.value = true
  disarm = window.setTimeout(cancel, 3000)
}

function cancel() {
  clearTimeout(disarm)
  confirming.value = false
}

onBeforeUnmount(cancel)
</script>

<template>
  <div class="group relative">
    <button
      type="button"
      class="flex h-8 w-full items-center gap-2 rounded-md ps-2 pe-8 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      :class="props.tab.id === workspace.activeTabId ? 'bg-selection' : 'hover:bg-selection-hover'"
      :aria-current="props.tab.id === workspace.activeTabId ? 'true' : undefined"
      @click="select"
    >
      <MessageSquare class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <span class="truncate">{{ tabTitle(props.tab) }}</span>
    </button>
    <button
      type="button"
      class="absolute end-1 top-1 grid size-6 place-items-center rounded focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent"
      :class="confirming ? 'bg-danger/15 text-danger opacity-100' : 'text-muted opacity-0 group-hover:opacity-100 hover:bg-selection-hover hover:text-content'"
      :aria-label="confirming ? t('chats.confirmDelete') : t('chats.delete')"
      :title="confirming ? t('chats.confirmDelete') : t('chats.delete')"
      @click="remove"
      @blur="cancel"
    >
      <Trash2 class="size-3.5" aria-hidden="true" />
    </button>
  </div>
</template>
