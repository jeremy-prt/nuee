<script setup lang="ts">
import { computed, useId } from 'vue'
import { colorVar, mascotSvg, type ProjectColor } from '@/utils/projects'

const props = defineProps<{ mascot: string; color: ProjectColor }>()
const id = useId()
// Dessins fixes de src/assets/mascots, jamais une sortie d'agent : v-html sans risque.
const svg = computed(() => mascotSvg(props.mascot, id))
</script>

<template>
  <span class="mascot inline-block [&>svg]:block [&>svg]:size-full" :style="{ '--tint': colorVar(color) }" aria-hidden="true" v-html="svg" />
</template>
