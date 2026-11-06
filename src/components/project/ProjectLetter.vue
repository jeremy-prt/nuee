<script setup lang="ts">
import { computed } from 'vue'
import { type IconColor, iconColorVar } from '@/utils/projects'

// Carré coloré à l'initiale du projet, comme Paseo. Taille posée par le parent, lettre à l'échelle (cqh).
const props = defineProps<{ name: string; color: IconColor }>()
const letter = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?')
</script>

<template>
  <span
    class="grid place-items-center rounded-[25%] font-semibold leading-none text-white [container-type:size]"
    :style="{ background: iconColorVar(color) }"
    aria-hidden="true"
  >
    <span class="text-[62cqh]">{{ letter }}</span>
  </span>
</template>
