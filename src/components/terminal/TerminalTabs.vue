<script setup lang="ts">
import { SquareTerminal, X } from '@/components/ui/icons'
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalsStore } from '@/stores/terminals'

// Remplace le titre « Terminal » du volet dès que la session a plusieurs shells.

const { t } = useI18n()
const terminals = useTerminalsStore()
const { chat } = useTerminalChat()

const list = computed(() => (chat.value ? terminals.tabsOf(chat.value.id) : []))
const activeKey = computed(() => (chat.value ? (terminals.active[chat.value.id] ?? null) : null))

function select(key: string) {
  if (!chat.value) return
  terminals.active[chat.value.id] = key
  nextTick(() => terminals.focus(key))
}
</script>

<template>
  <div class="flex min-w-0 shrink items-center gap-0.5" role="group" :aria-label="t('dock.terminal.list')">
    <div
      v-for="tab in list"
      :key="tab.key"
      class="group/row relative flex h-7 max-w-40 min-w-20 shrink items-center rounded-md text-xs"
      :class="tab.key === activeKey ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
    >
      <button
        type="button"
        class="flex h-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 focus-visible:outline-2 focus-visible:outline-ring"
        :aria-current="tab.key === activeKey ? 'true' : undefined"
        @click="select(tab.key)"
      >
        <SquareTerminal class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ t('dock.terminal.tab', { n: tab.number }) }}</span>
      </button>
      <UiIconButton
        inner
        class="absolute end-1 size-5! opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        :class="{ 'opacity-100': tab.key === activeKey }"
        :label="t('dock.terminal.close')"
        @click="chat && terminals.close(chat.id, tab.key)"
      >
        <X class="size-3" aria-hidden="true" />
      </UiIconButton>
    </div>
  </div>
</template>
