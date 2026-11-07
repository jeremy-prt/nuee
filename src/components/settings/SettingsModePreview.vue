<script setup lang="ts">
import { computed } from 'vue'
import { useAppearanceStore } from '@/stores/appearance'
import { accentColor, type ColorMode, palette, type ResolvedMode } from '@/utils/themes'

const props = defineProps<{ mode: ColorMode }>()
const appearance = useAppearanceStore()

function colors(mode: ResolvedMode) {
  const { canvas, content } = palette(appearance.theme, mode, mode === 'dark' ? 10 : 96)
  const chrome = palette(appearance.theme, mode, mode === 'dark' ? 6 : 93).veil
  return { canvas, content, chrome, accent: accentColor(appearance.accent, mode) }
}

// Système : la moitié gauche en clair, la droite en sombre, comme T3 Code.
const halves = computed(() =>
  props.mode === 'system'
    ? [
        { colors: colors('light'), clip: 'inset(0 50% 0 0)' },
        { colors: colors('dark'), clip: 'inset(0 0 0 50%)' },
      ]
    : [{ colors: colors(props.mode), clip: 'none' }],
)
</script>

<template>
  <div class="relative aspect-2/1 overflow-hidden rounded-lg border border-stroke text-[6px]" aria-hidden="true">
    <div
      v-for="(half, index) in halves"
      :key="index"
      class="absolute inset-0 flex"
      :style="{ clipPath: half.clip, background: half.colors.chrome, color: half.colors.content }"
    >
      <div class="flex w-1/4 flex-col gap-[1em] p-[1.4em]">
        <span class="h-[1em] w-3/4 rounded-full bg-current opacity-30" />
        <span class="h-[1em] w-full rounded-full bg-current opacity-15" />
        <span class="h-[1em] w-2/3 rounded-full bg-current opacity-15" />
      </div>
      <div class="mt-[1.4em] flex flex-1 flex-col gap-[1em] rounded-ss-[1.2em] p-[1.6em]" :style="{ background: half.colors.canvas }">
        <span class="ms-auto h-[1.4em] w-1/3 rounded-full bg-current opacity-20" />
        <span class="h-[1em] w-2/3 rounded-full bg-current opacity-15" />
        <span class="h-[1em] w-1/2 rounded-full bg-current opacity-15" />
        <span class="mt-auto flex h-[2.4em] items-center justify-end rounded-[0.8em] border border-current/15 px-[0.5em]">
          <span class="size-[1.5em] rounded-full" :style="{ background: half.colors.accent }" />
        </span>
      </div>
    </div>
  </div>
</template>
