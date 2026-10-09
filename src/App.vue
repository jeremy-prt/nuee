<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="flex h-screen items-center justify-center bg-neutral-950 text-neutral-100 select-none">
    <h1 class="text-4xl font-semibold tracking-tight">{{ t('home.title') }}</h1>
  </main>
</template>
