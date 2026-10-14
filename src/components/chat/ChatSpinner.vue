<script setup lang="ts">
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { agents } from '@/utils/agents'

// Quatre points qui tournent en se resserrant, à la couleur de l'agent (gris avec `muted`). Tout en transformations
// CSS : l'animation reste fluide même quand la conversation se redessine.
defineProps<{ agent: AgentKind; muted?: boolean }>()

const DOTS = [
  [0, -4.5],
  [4.5, 0],
  [0, 4.5],
  [-4.5, 0],
] as const
</script>

<template>
  <svg
    viewBox="0 0 16 16"
    class="chat-spinner size-[1em] shrink-0"
    :class="{ 'text-muted': muted }"
    :style="muted ? undefined : { color: agents[agent].color }"
    aria-hidden="true"
  >
    <g class="chat-spinner-turn">
      <circle
        v-for="([x, y], index) in DOTS"
        :key="index"
        class="chat-spinner-dot"
        cx="8"
        cy="8"
        r="1.9"
        fill="currentColor"
        :style="{ '--x': `${x}px`, '--y': `${y}px` }"
      />
    </g>
  </svg>
</template>
