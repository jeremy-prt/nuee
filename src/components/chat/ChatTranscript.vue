<script setup lang="ts">
import { CircleAlert, LoaderCircle } from '@lucide/vue'
import { onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatTool from '@/components/chat/ChatTool.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { ChatItem } from '@/stores/conversations'
import { agents } from '@/utils/agents'

const props = defineProps<{ items: readonly ChatItem[]; running: boolean; agent: AgentKind }>()

const { t, locale } = useI18n()
const scroller = useTemplateRef('scroller')

// Suit le bas tant que l'utilisateur n'est pas remonté lire plus haut.
let stick = true

function onScroll() {
  const el = scroller.value
  if (el) stick = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

function scrollToEnd() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => props.items,
  (items) => {
    if (items.at(-1)?.kind === 'user') stick = true
    if (stick) scrollToEnd()
  },
  { flush: 'post' },
)

onMounted(scrollToEnd)

function duration(ms: number) {
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'second', maximumFractionDigits: 1 }).format(ms / 1000)
}

function agentParams() {
  return { agent: agents[props.agent].name, command: agents[props.agent].command }
}
</script>

<template>
  <div ref="scroller" class="overflow-y-auto" @scroll.passive="onScroll">
    <ol class="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6" role="log" :aria-busy="running" :aria-label="t('chat.transcript')">
      <li v-for="(item, index) in items" :key="item.id" :class="{ 'flex justify-end': item.kind === 'user' }">
        <p
          v-if="item.kind === 'user'"
          class="max-w-[85%] rounded-xl bg-selection px-3 py-2 text-sm whitespace-pre-wrap break-words select-text"
        >{{ item.text }}</p>
        <ChatMarkdown v-else-if="item.kind === 'text'" :text="item.text" />
        <ChatTool v-else-if="item.kind === 'tool'" :item="item" />
        <template v-else-if="item.kind === 'end'">
          <p v-if="item.status === 'completed'" class="text-xs text-muted">
            {{ item.durationMs === null ? t('chat.end.done') : t('chat.end.completed', { duration: duration(item.durationMs) }) }}
          </p>
          <p v-else-if="item.status === 'stopped'" class="text-xs text-muted">
            {{ items[index - 1]?.kind === 'text' ? t('chat.end.stoppedKept', agentParams()) : t('chat.end.stopped') }}
          </p>
          <div v-else class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
            <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div class="min-w-0">
              <p v-if="item.status === 'unauthenticated'">{{ t('chat.end.unauthenticated', agentParams()) }}</p>
              <template v-else>
                <p>{{ t('chat.end.failed', agentParams()) }}</p>
                <pre v-if="item.error" class="mt-1 font-mono text-xs whitespace-pre-wrap break-words text-muted select-text">{{ item.error }}</pre>
              </template>
            </div>
          </div>
        </template>
        <div v-else class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
          <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p class="min-w-0 break-words select-text">
            {{ t(`chat.errors.${item.error.kind}`, { ...agentParams(), detail: item.error.message }) }}
          </p>
        </div>
      </li>
      <li v-if="running" class="flex items-center gap-2 text-xs text-muted">
        <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('chat.working', agentParams()) }}
      </li>
    </ol>
  </div>
</template>
