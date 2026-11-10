<script lang="ts">
import { reactive } from 'vue'

// Choix de l'utilisateur (ouvert ou replié) par session d'origine, gardé tant que l'app tourne.
const toggled = reactive<Record<string, boolean>>({})
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import { useAttentionStore } from '@/stores/attention'
import { useConversationsStore } from '@/stores/conversations'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Une session de la liste et celles que son agent a lancées, en retrait dessous avec un trait de rattachement,
// comme l'app Claude. Les imbriquées n'ont pas `data-chat-id` : le glisser ne range que le premier niveau.

const props = defineProps<{ tab: Tab }>()

const attention = useAttentionStore()
const conversations = useConversationsStore()
const workspace = useWorkspaceStore()

const children = computed(() => workspace.nestedChats.byParent.get(props.tab.id) ?? [])
const unread = computed(() => children.value.filter((child) => attention.isUnseen(child.id)).length)

// Ouvert d'office tant que la session ou l'une des siennes est affichée ou travaille, comme monocode.
const inPlay = (id: string) => id === workspace.activeTabId || conversations.working(id)
const open = computed(() => toggled[props.tab.id] ?? (inPlay(props.tab.id) || children.value.some((child) => inPlay(child.id))))

// Une session imbriquée qui s'ouvre (lien d'une carte, onglet) rouvre le groupe replié à la main.
watch(
  () => workspace.activeTabId,
  (id) => {
    if (id && children.value.some((child) => child.id === id)) delete toggled[props.tab.id]
  },
)
</script>

<template>
  <ShellChatItem
    :tab="tab"
    :group="children.length ? { open, unread } : undefined"
    @toggle="toggled[tab.id] = !open"
  />
  <ul v-if="children.length && open" class="ms-4 pt-0.5">
    <li v-for="(child, index) in children" :key="child.id" class="relative ps-3" :class="{ 'pb-0.5': index < children.length - 1 }">
      <span v-if="index < children.length - 1" class="absolute start-0 top-0 h-full w-px bg-content/20" aria-hidden="true" />
      <span v-else class="absolute start-0 top-0 h-1/2 w-2 rounded-es-md border-s border-b border-content/20" aria-hidden="true" />
      <ShellChatItem :tab="child" />
    </li>
  </ul>
</template>
