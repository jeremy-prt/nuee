<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDotField from '@/components/chat/ChatDotField.vue'
import ChatPane from '@/components/chat/ChatPane.vue'
import ChatScenes from '@/components/chat/ChatScenes.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useEffects } from '@/composables/useEffects'
import { useTabTitle } from '@/composables/useTabTitle'
import { useConversationsStore } from '@/stores/conversations'
import { useDraftsStore } from '@/stores/drafts'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ index: number }>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

const tab = computed(() => workspace.tabs.find((tab) => tab.id === workspace.panes[props.index]))
const title = computed(() => (tab.value ? tabTitle(tab.value) : ''))
const focused = computed(() => workspace.focusedPane === props.index)

// Fond étoilé et scènes de la session vierge : posés ici et non dans ChatPane (recréé à chaque onglet) pour passer
// d'une session à l'autre en fondu.
const dotField = useEffects('background')
const scenes = useEffects('scenes')
const conversations = useConversationsStore()
const drafts = useDraftsStore()
const blank = computed(() => {
  const current = tab.value
  if (current?.kind !== 'chat' || current.started) return false
  const conversation = conversations.find(current.id)
  return !!conversation?.loaded && !conversation.items.length
})
const typing = computed(() => !!(tab.value && drafts.get(tab.value.id)?.text.trim()))
</script>

<template>
  <section
    class="relative isolate flex min-w-0 flex-1 flex-col"
    :data-pane-index="index"
    :aria-label="title"
    @pointerdown="workspace.focusedPane = index"
    @focusin="workspace.focusedPane = index"
  >
    <div
      v-if="workspace.panes.length > 1"
      class="flex h-8 shrink-0 items-center gap-2 border-t-2 border-b border-b-stroke ps-3 pe-1 text-xs"
      :class="focused ? 'border-t-ring text-content' : 'border-t-transparent text-muted'"
    >
      <span class="flex-1 truncate">{{ title }}</span>
      <UiIconButton :label="t('workspace.closePane')" @click="workspace.closePane(index)">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
    <ChatDotField v-if="dotField" :visible="blank" :enabled="!typing" class="pointer-events-none absolute inset-0 -z-10 size-full" />
    <ChatScenes v-if="scenes" :active="blank" class="absolute inset-x-6 bottom-1 -z-10 w-[calc(100%-3rem)]" />
    <ChatPane v-if="tab?.kind === 'chat'" :key="tab.id" :tab="tab" class="min-h-0 flex-1" />
  </section>
</template>
