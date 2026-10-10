<script setup lang="ts">
import ShellBackgroundImage from '@/components/shell/ShellBackgroundImage.vue'
import { BACKGROUND_OPACITY, INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'

defineProps<{ path: string; large?: boolean }>()
const appearance = useAppearanceStore()
</script>

<template>
  <!-- Une maquette de l'app (barre latérale, bulles, zone de saisie) : l'image se juge telle qu'elle sera vue. -->
  <div
    class="flex aspect-video overflow-hidden border border-stroke bg-canvas"
    :class="large ? 'rounded-xl text-[10px]' : 'rounded-lg text-[5px]'"
    aria-hidden="true"
  >
    <div class="flex w-1/5 flex-col gap-[1em] border-e border-stroke bg-content/3 p-[1.4em]">
      <span class="h-[1em] w-3/4 rounded-full bg-content/25" />
      <span class="h-[1em] w-full rounded-full bg-content/15" />
      <span class="h-[1em] w-2/3 rounded-full bg-content/15" />
    </div>
    <div class="relative isolate flex flex-1 flex-col gap-[1.2em] overflow-hidden p-[1.8em]">
      <div class="absolute inset-0 -z-10 overflow-hidden" :style="{ opacity: BACKGROUND_OPACITY[appearance.background.visibility] / 100 }">
        <ShellBackgroundImage
          :path="path"
          :effect="appearance.background.effect"
          :level="INTENSITY_LEVEL[appearance.background.intensity]"
          :scale="large ? 0.5 : 0.15"
        />
      </div>
      <span class="ms-auto h-[2.4em] w-2/5 rounded-[0.9em] bg-content/15" />
      <span class="h-[1em] w-3/4 rounded-full bg-content/20" />
      <span class="h-[1em] w-1/2 rounded-full bg-content/20" />
      <span class="ms-auto h-[2.4em] w-1/3 rounded-[0.9em] bg-content/15" />
      <span class="mt-auto h-[3em] rounded-[1em] border border-content/15 bg-canvas/40" />
    </div>
  </div>
</template>
