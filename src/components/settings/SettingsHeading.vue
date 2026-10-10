<script setup lang="ts">
// Titre d'une section des réglages, avec à droite son action (Restaurer).
defineProps<{ title: string; id?: string }>()
</script>

<template>
  <div class="flex items-end gap-4 pb-2.5">
    <h3 :id="id" class="min-w-0 flex-1 text-sm font-semibold">{{ title }}</h3>
    <slot />
  </div>
</template>
