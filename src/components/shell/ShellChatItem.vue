<script setup lang="ts">
import { MessageSquare } from '@lucide/vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { useNavigationStore } from '@/stores/navigation'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ tab: Tab }>()

const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

// Le chat peut venir d'un autre contexte (recherche) : on bascule d'abord sur son projet.
function select() {
  navigation.openChats(props.tab.projectId)
  workspace.show(props.tab.id)
}
</script>

<template>
  <button
    type="button"
    class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    :class="props.tab.id === workspace.activeTabId ? 'bg-selection' : 'hover:bg-selection-hover'"
    :aria-current="props.tab.id === workspace.activeTabId ? 'true' : undefined"
    @click="select"
  >
    <MessageSquare class="size-4 shrink-0 text-muted" aria-hidden="true" />
    <span class="truncate">{{ tabTitle(props.tab) }}</span>
  </button>
</template>
