<script setup lang="ts">
// Niveau d'effort en barres montantes, comme un indicateur de signal : `level` barres pleines sur `count`.
// Boîte de 10 px, pas 12 : le pied des barres tombe sur la ligne de base du nom du modèle.
defineProps<{ level: number; count: number }>()
</script>

<template>
  <span class="flex h-2.5 shrink-0 items-end gap-px" aria-hidden="true">
    <span
      v-for="index in count"
      :key="index"
      class="w-0.5 rounded-full bg-current transition-opacity duration-200 ease-out motion-reduce:transition-none"
      :class="index <= level ? 'opacity-100' : 'opacity-25'"
      :style="{ height: `${4 + (6 * (index - 1)) / Math.max(1, count - 1)}px` }"
    />
  </span>
</template>
