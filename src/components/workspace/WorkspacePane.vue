<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatPane from '@/components/chat/ChatPane.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ index: number }>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

const tab = computed(() => workspace.tabs.find((tab) => tab.id === workspace.panes[props.index]))
const title = computed(() => (tab.value ? tabTitle(tab.value) : ''))
const focused = computed(() => workspace.focusedPane === props.index)
</script>

<template>
  <section
    class="flex min-w-0 flex-1 flex-col"
    :data-pane-index="index"
    :aria-label="title"
    @pointerdown="workspace.focusedPane = index"
    @focusin="workspace.focusedPane = index"
  >
    <div
      v-if="workspace.panes.length > 1"
      class="flex h-8 shrink-0 items-center gap-2 border-t-2 border-b border-b-stroke ps-3 pe-1 text-xs"
      :class="focused ? 'border-t-accent text-content' : 'border-t-transparent text-muted'"
    >
      <span class="flex-1 truncate">{{ title }}</span>
      <UiIconButton :label="t('workspace.closePane')" @click="workspace.closePane(index)">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
    <ChatPane v-if="tab?.kind === 'chat'" :key="tab.id" class="min-h-0 flex-1" />
  </section>
</template>
