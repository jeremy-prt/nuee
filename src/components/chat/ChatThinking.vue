<script setup lang="ts">
import { Brain, ChevronRight } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import { formatDuration } from '@/utils/duration'

// Réflexion de l'agent (son résumé) : en cours, la dernière phrase défile sous le titre ; finie, elle se replie.
const props = defineProps<{ text: string; durationMs: number | null; live: boolean }>()

const { t, locale } = useI18n()
const open = ref(false)
const title = computed(() => {
  if (props.live) return t('chat.activity.thinking')
  return props.durationMs === null || props.durationMs < 1000
    ? t('chat.activity.thought')
    : t('chat.activity.thoughtFor', { duration: formatDuration(props.durationMs, locale.value) })
})
// Dernière phrase non vide, sans le gras dont le résumé coiffe chaque étape.
const latest = computed(() => {
  const sentences = props.text.replace(/\*\*/g, '').split(/(?<=[.!?:])\s+|\n+/).map((part) => part.trim())
  return sentences.filter(Boolean).at(-1) ?? ''
})
</script>

<template>
  <div class="text-xs">
    <button
      type="button"
      class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-start text-muted hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring"
      :aria-expanded="open"
      :disabled="!text"
      @click="open = !open"
    >
      <Brain class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="shrink-0 font-medium" :class="live ? 'text-shimmer' : 'text-content'">{{ title }}</span>
      <ChevronRight
        v-if="text"
        class="ms-auto size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
        :class="{ 'rotate-90': open }"
        aria-hidden="true"
      />
    </button>
    <p v-if="live && !open && latest" class="ms-7.5 me-2 line-clamp-2 text-muted">{{ latest }}</p>
    <div v-if="open" class="ms-7.5 me-2 border-s border-stroke ps-3 text-muted">
      <ChatMarkdown :text="text" :streaming="live" />
    </div>
  </div>
</template>
