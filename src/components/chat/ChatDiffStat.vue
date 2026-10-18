<script setup lang="ts">
// plain : texte coloré sans fond, sans le côté resté à zéro (liste des sessions).
defineProps<{ added: number; removed: number; plain?: boolean }>()
</script>

<template>
  <span v-if="plain" class="inline-flex shrink-0 gap-1 tabular-nums">
    <span v-if="added" class="text-success">+{{ added }}</span>
    <span v-if="removed" class="text-danger">−{{ removed }}</span>
  </span>
  <span v-else class="inline-flex shrink-0 overflow-hidden rounded font-mono text-[11px] leading-4 tabular-nums">
    <span class="bg-success/15 px-1 text-success">+{{ added }}</span>
    <span class="bg-danger/15 px-1 text-danger">−{{ removed }}</span>
  </span>
</template>
