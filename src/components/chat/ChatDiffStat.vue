<script setup lang="ts">
defineProps<{ added: number; removed: number }>()
</script>

<template>
  <span class="inline-flex shrink-0 overflow-hidden rounded font-mono text-[11px] leading-4 tabular-nums">
    <span class="bg-success/15 px-1 text-success">+{{ added }}</span>
    <span class="bg-danger/15 px-1 text-danger">−{{ removed }}</span>
  </span>
</template>
