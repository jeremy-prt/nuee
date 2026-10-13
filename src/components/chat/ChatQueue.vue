<script setup lang="ts">
import { Clock, CornerDownRight, SendHorizontal, X } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { Queued } from '@/stores/conversations'

// Messages envoyés pendant un tour : ils partent un par un à la fin de chaque tour.
// answering : l'agent répond, un message peut rejoindre sa réponse ; sinon il part tout de suite.
defineProps<{ queue: readonly Queued[]; answering: boolean }>()
const emit = defineEmits<{ send: [id: string]; remove: [id: string] }>()

const { t } = useI18n()
</script>

<template>
  <section class="w-full overflow-hidden rounded-xl border border-stroke bg-content/3" :aria-label="t('chat.queue.label')">
    <ul>
      <li v-for="message in queue" :key="message.id" class="flex items-center gap-2 border-b border-stroke py-1 ps-3 pe-1 last:border-b-0">
        <Clock class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span class="shrink-0 text-xs text-muted">{{ t('chat.queue.waiting') }}</span>
        <p class="min-w-0 flex-1 truncate text-[13px]">{{ message.prompt || message.attachments.map((attachment) => attachment.name).join(', ') }}</p>
        <UiIconButton :label="answering ? t('chat.queue.steer') : t('chat.queue.send')" @click="emit('send', message.id)">
          <component :is="answering ? CornerDownRight : SendHorizontal" class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton :label="t('chat.queue.remove')" @click="emit('remove', message.id)">
          <X class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </li>
    </ul>
  </section>
</template>
