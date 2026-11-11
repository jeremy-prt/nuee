<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ServerStatus } from '@/ipc/bindings/ServerStatus'

defineProps<{ status: ServerStatus }>()
const { t } = useI18n()
</script>

<template>
  <span class="grid place-items-center">
    <span
      class="size-2 rounded-full"
      :class="{
        'bg-success': status === 'running',
        'animate-pulse bg-warning motion-reduce:animate-none': status === 'starting',
        'bg-danger': status === 'exited',
        'bg-content/25': status === 'stopped',
      }"
      aria-hidden="true"
    />
    <span class="sr-only">{{ t(`dock.servers.status.${status}`) }}</span>
  </span>
</template>
