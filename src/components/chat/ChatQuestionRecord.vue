<script setup lang="ts">
import { chatCard } from '@/components/chat/card'
import { useI18n } from 'vue-i18n'
import type { ToolItem } from '@/stores/conversations'

// Questions de l'agent une fois répondues, gardées dans la conversation.
defineProps<{ answers: NonNullable<ToolItem['answers']> }>()

const { t } = useI18n()
</script>

<template>
  <!-- Même cadre que la carte de questions : chaque question, sa réponse dessous en plus discret. -->
  <dl :class="chatCard" class="divide-y divide-stroke text-sm">
    <div v-for="(entry, index) in answers" :key="index" class="px-4 py-2.5">
      <dt>{{ entry.prompt }}</dt>
      <dd class="text-muted" :class="{ italic: entry.answer === null }">{{ entry.answer ?? t('chat.question.skipped') }}</dd>
    </div>
  </dl>
</template>
