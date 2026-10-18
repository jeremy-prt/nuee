<script setup lang="ts">
import { Minimize2 } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { CompactItem } from '@/stores/conversations'
import { formatClock } from '@/utils/duration'

// Ligne qui sépare la conversation résumée de la suite, comme dans l'app Claude, avec la place prise avant et après.
const props = defineProps<{ item: CompactItem; agent: AgentKind }>()

const { t, locale } = useI18n()
const running = computed(() => props.item.status === 'running')
// Raison donnée par l'agent, dans sa langue à lui.
const error = computed(() => (props.item.status === 'failed' ? props.item.error : undefined))
const tokens = computed(() => {
  const { before, after } = props.item
  if (before === undefined || after === undefined) return null
  const format = new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 })
  return t('chat.compact.tokens', { before: format.format(before), after: format.format(after) })
})
</script>

<template>
  <div class="flex items-center gap-3 pt-1 pb-5 text-xs text-muted">
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
    <p class="flex min-w-0 items-center gap-1.5" :title="error ?? formatClock(item.at, locale, true)">
      <ChatSpinner v-if="running" :agent="agent" muted class="text-sm" />
      <Minimize2 v-else class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 truncate" :class="{ 'text-shimmer': running }">
        {{ t(`chat.compact.${item.status}`) }}<span v-if="tokens" class="tabular-nums"> · {{ tokens }}</span><template v-else-if="error"> · {{ error }}</template>
      </span>
    </p>
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
  </div>
</template>
