<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChatComposer from '@/components/chat/ChatComposer.vue'

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-8 overflow-y-auto px-6 pb-16">
    <div class="text-center">
      <p class="text-3xl font-semibold tracking-tight">Nuée</p>
      <p class="mt-2 text-sm text-muted">{{ t('chat.subtitle') }}</p>
    </div>
    <ChatComposer class="w-full max-w-2xl" />
  </div>
</template>
