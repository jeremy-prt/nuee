<script setup lang="ts">
import { computed } from 'vue'
import { mcpLogo, mcpLogoColor } from '@/utils/mcp'

// Logo d'un serveur MCP connu (Simple Icons, à la couleur de sa marque), sinon son initiale dans un petit carré.
const props = defineProps<{ name: string }>()
const logo = computed(() => mcpLogo(props.name))
const color = computed(() => mcpLogoColor(props.name))
const initial = computed(() => Array.from(props.name.replace(/^claude\.ai\s+/i, '').trim())[0]?.toUpperCase() ?? '?')
</script>

<template>
  <!-- SVG embarqués dans l'app (src/assets/mcp), jamais une donnée venue d'un serveur : v-html sans risque. -->
  <span v-if="logo" class="grid size-4 shrink-0 place-items-center [&>svg]:size-3.5 [&>svg]:fill-current" aria-hidden="true" :style="color ? { color } : undefined" v-html="logo" />
  <span v-else class="grid size-4 shrink-0 place-items-center rounded-[25%] bg-content/10 text-[10px] font-semibold text-muted" aria-hidden="true">
    {{ initial }}
  </span>
</template>
