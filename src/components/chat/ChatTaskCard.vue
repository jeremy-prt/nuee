<script setup lang="ts">
import { chatCard } from '@/components/chat/card'
import { ChevronDown, ChevronRight } from '@/components/ui/icons'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatFoldText from '@/components/chat/ChatFoldText.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import { useConversationsStore } from '@/stores/conversations'
import { useWorkspaceStore } from '@/stores/workspace'

// Consigne d'une session lancée par une autre, comme la carte « Tâche » de l'app Claude : dans la session qui l'a
// lancée (`sessionId` : le titre suit ses renommages) et en tête de celle-ci.
const props = defineProps<{ title: string | null; text: string; sessionId?: string | null; folded?: boolean }>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const conversations = useConversationsStore()

const session = computed(() => (props.sessionId ? workspace.tabs.find((tab) => tab.id === props.sessionId && !tab.archived) ?? null : null))
// Dans la session lanceuse, la carte dit si la session lancée travaille encore.
const working = computed(() => !!session.value && conversations.working(session.value.id))
const shownTitle = computed(() => session.value?.title ?? props.title)
const open = ref(!props.folded)
const bodyId = useId()
</script>

<template>
  <section :class="chatCard" class="text-sm">
    <button
      type="button"
      class="group/head flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-muted hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :aria-expanded="open"
      :aria-controls="open ? bodyId : undefined"
      @click="open = !open"
    >
      <span class="shrink-0">{{ t('chat.fromSession.task') }}</span>
      <span v-if="shownTitle" class="min-w-0 truncate text-content/85 group-hover/head:text-content">{{ shownTitle }}</span>
      <component :is="open ? ChevronDown : ChevronRight" class="-ms-1 size-3.5 shrink-0" aria-hidden="true" />
      <ChatSpinner v-if="working && session" :agent="session.agent" muted class="ms-auto text-sm" />
      <span v-if="working" class="sr-only">{{ t('chat.tool.running') }}</span>
    </button>
    <ChatFoldText v-if="open" :id="bodyId" class="px-3 pb-2.5" :text="text" />
  </section>
</template>
