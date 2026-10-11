<script setup lang="ts">
import { computed, toRef } from 'vue'
import { type BackgroundSize, useBackgroundImage } from '@/composables/useBackgroundImage'
import type { BackgroundEffect } from '@/stores/appearance'
import { cssEffect, type EffectLevel } from '@/utils/backgroundEffects'

// L'image et son effet, posée en absolu : le parent la rogne (overflow-hidden) et règle son opacité.
// `scale` réduit le flou CSS dans une vignette (1 = taille réelle).
const props = withDefaults(
  defineProps<{ path: string; effect: BackgroundEffect; level: EffectLevel; scale?: number; size?: BackgroundSize; darken?: boolean }>(),
  { scale: 1, size: 'full' },
)
const url = useBackgroundImage(toRef(props, 'path'), toRef(props, 'effect'), toRef(props, 'level'), props.size)
const style = computed(() => ({
  backgroundImage: url.value ? `url('${url.value}')` : undefined,
  ...cssEffect(props.effect, props.level, props.scale),
}))
</script>

<template>
  <div v-if="!url" class="absolute inset-0 animate-pulse bg-content/5 motion-reduce:animate-none" aria-hidden="true" />
  <!-- Fondu seulement si l'image arrive après coup (lancement, nouvel effet), comme monocode : déjà en cache, elle
       est là dès le premier rendu et Transition, sans `appear`, ne joue rien. -->
  <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-500 ease-out motion-reduce:transition-none">
    <div v-if="url" class="absolute inset-0 bg-cover bg-center" :style="style" aria-hidden="true" />
  </Transition>
  <!-- Plus sombre en bas, où sont le chat et la zone de saisie. -->
  <div v-if="darken" class="absolute inset-0 bg-linear-to-b from-black/15 to-black/55" aria-hidden="true" />
</template>
