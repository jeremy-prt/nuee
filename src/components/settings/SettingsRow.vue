<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stroke px-4 py-2.5 last:border-b-0">
    <p class="min-w-40 flex-1 text-sm font-medium">{{ label }}</p>
    <slot />
  </div>
</template>
