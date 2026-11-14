<script setup lang="ts">
// Lettres qui ondulent une fois à l'apparition (`.wave-letter` de main.css, coupé avec les effets animés).
defineProps<{ text: string }>()
</script>

<template>
  <span>
    <span aria-hidden="true">
      <span v-for="(char, index) in Array.from(text)" :key="index" class="wave-letter whitespace-pre" :style="{ '--index': index }">{{ char }}</span>
    </span>
    <span class="sr-only">{{ text }}</span>
  </span>
</template>
