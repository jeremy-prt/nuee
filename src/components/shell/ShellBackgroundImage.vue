<script setup lang="ts">
import { computed, toRef } from 'vue'
import { type BackgroundSize, useBackgroundImage } from '@/composables/useBackgroundImage'
import type { BackgroundEffect } from '@/stores/appearance'
import { cssEffect, type EffectLevel } from '@/utils/backgroundEffects'

// L'image et son effet, posée en absolu : le parent la rogne (overflow-hidden) et règle son opacité.
// `scale` réduit le flou CSS dans une vignette (1 = taille réelle).
const props = withDefaults(
  defineProps<{ path: string; effect: BackgroundEffect; level: EffectLevel; scale?: number; size?: BackgroundSize }>(),
  { scale: 1, size: 'full' },
)
const url = useBackgroundImage(toRef(props, 'path'), toRef(props, 'effect'), toRef(props, 'level'), props.size)
const style = computed(() => ({
  backgroundImage: url.value ? `url('${url.value}')` : undefined,
  ...cssEffect(props.effect, props.level, props.scale),
}))
</script>

<template>
  <div v-if="url" class="absolute inset-0 bg-cover bg-center" :style="style" aria-hidden="true" />
  <div v-else class="absolute inset-0 animate-pulse bg-content/5 motion-reduce:animate-none" aria-hidden="true" />
</template>
