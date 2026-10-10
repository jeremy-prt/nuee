<script setup lang="ts">
import { computed } from 'vue'
import type { GlassValues } from '@/stores/appearance'

const props = defineProps<{ values: GlassValues }>()

function veil(alpha: number) {
  const { tint, lightness } = props.values
  return `color-mix(in srgb, color-mix(in srgb, var(--color-accent) ${tint}%, hsl(240 0% ${lightness}%)) ${alpha}%, transparent)`
}

const chrome = computed(() => ({ background: veil(props.values.chrome), backdropFilter: 'blur(2px)' }))
const surface = computed(() => ({ background: veil(props.values.surface), backdropFilter: 'blur(2px)' }))
</script>

<template>
  <!-- Un faux fond d'écran (lune sur des dunes) : la transparence ne se voit que s'il y a quelque chose derrière. -->
  <div class="relative aspect-2/1 overflow-hidden rounded-lg border border-stroke bg-overlay text-[6px]" aria-hidden="true">
    <div class="absolute inset-0 bg-radial-[at_88%_38%] from-content/15 to-transparent to-45%" />
    <span class="absolute top-[32%] end-[9%] aspect-square w-[8%] rounded-full bg-content/60 shadow-[0_0_12px_3px] shadow-content/20" />
    <svg class="absolute inset-0 size-full text-content" viewBox="0 0 200 100" preserveAspectRatio="none">
      <g fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5">
        <path d="M-2 52 C 40 44, 80 60, 120 54 S 180 46, 202 50 V102 H-2Z" stroke-opacity="0.22" />
        <path d="M-2 55 C 40 47, 81 62, 121 56 S 180 48, 202 52 V102 H-2Z" stroke-opacity="0.3" />
        <path d="M-2 60 C 42 52, 82 68, 122 61 S 181 54, 202 58 V102 H-2Z" stroke-opacity="0.38" />
        <path d="M-2 69 C 43 61, 85 75, 125 68 S 182 62, 202 65 V102 H-2Z" stroke-opacity="0.45" />
        <path d="M-2 79 C 45 71, 88 85, 128 78 S 183 72, 202 75 V102 H-2Z" stroke-opacity="0.52" />
        <path d="M-2 92 C 47 84, 91 97, 131 88 S 184 83, 202 87 V102 H-2Z" stroke-opacity="0.6" />
      </g>
    </svg>
    <div class="relative flex h-full">
      <div class="flex w-1/4 flex-col gap-[1em] border-e border-stroke p-[1.4em]" :style="chrome">
        <span class="h-[1em] w-3/4 rounded-full bg-content/25" />
        <span class="h-[1em] w-full rounded-full bg-content/15" />
        <span class="h-[1em] w-2/3 rounded-full bg-content/15" />
      </div>
      <div class="flex flex-1 flex-col gap-[1em] p-[1.6em]" :style="surface">
        <span class="ms-auto h-[1.4em] w-1/3 rounded-full bg-content/20" />
        <span class="h-[1em] w-2/3 rounded-full bg-content/15" />
        <span class="h-[1em] w-1/2 rounded-full bg-content/15" />
        <span class="mt-auto h-[2.4em] rounded-[0.8em] border border-content/15" />
      </div>
    </div>
  </div>
</template>
