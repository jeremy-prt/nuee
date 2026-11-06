<script setup lang="ts">
import type { ServerStatus } from '@/ipc/bindings/ServerStatus'

defineProps<{ status: ServerStatus }>()
</script>

<template>
  <span class="grid place-items-center" aria-hidden="true">
    <span
      class="size-2 rounded-full"
      :class="{
        'bg-success': status === 'running',
        'animate-pulse bg-warning motion-reduce:animate-none': status === 'starting',
        'bg-danger': status === 'exited',
        'bg-content/25': status === 'stopped',
      }"
    />
  </span>
</template>
