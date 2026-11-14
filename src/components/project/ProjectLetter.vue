<script setup lang="ts">
import { computed } from 'vue'
import { type IconColor, iconColorVar } from '@/utils/projects'

// Initiale du projet comme T3 Code : lettre vive sur un fond de sa couleur, à 14 %. Taille posée par le parent, lettre à
// l'échelle (cqh).
const props = defineProps<{ name: string; color: IconColor }>()
const letter = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?')
</script>

<template>
  <span
    class="grid place-items-center rounded-[25%] font-mono font-bold leading-none [container-type:size]"
    :style="{ color: iconColorVar(color), background: `color-mix(in srgb, ${iconColorVar(color)} 14%, transparent)` }"
    aria-hidden="true"
  >
    <span class="text-[62cqh]">{{ letter }}</span>
  </span>
</template>
