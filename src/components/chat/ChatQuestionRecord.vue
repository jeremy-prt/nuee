<script setup lang="ts">
import { MessageQuestion } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import type { ToolItem } from '@/stores/conversations'

// Questions de l'agent une fois répondues, gardées dans la conversation.
defineProps<{ answers: NonNullable<ToolItem['answers']> }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex gap-2.5 text-sm">
    <MessageQuestion class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
    <dl class="flex min-w-0 flex-col gap-1.5">
      <div v-for="(entry, index) in answers" :key="index">
        <dt class="text-muted">{{ entry.prompt }}</dt>
        <dd :class="entry.answer === null ? 'text-muted italic' : ''">{{ entry.answer ?? t('chat.question.skipped') }}</dd>
      </div>
    </dl>
  </div>
</template>
