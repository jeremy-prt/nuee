<script setup lang="ts">
import { computed, toRef } from 'vue'
import { type BackgroundSize, useBackgroundImage } from '@/composables/useBackgroundImage'
import type { Background, BackgroundEffect } from '@/stores/appearance'
import type { EffectLevel } from '@/utils/backgroundEffects'

// L'image et son effet, posée en absolu : le parent la rogne (overflow-hidden) et règle son opacité.
// `blur` ajoute, comme monocode, un flou et un voile sombre qui montent du bas, sous la conversation et la zone de
// saisie. `scale` réduit ce flou dans une vignette (1 = taille réelle).
const props = withDefaults(
  defineProps<{ path: string; effect: BackgroundEffect; level: EffectLevel; scale?: number; size?: BackgroundSize; blur?: Background['blur'] }>(),
  { scale: 1, size: 'full' },
)
const url = useBackgroundImage(toRef(props, 'path'), toRef(props, 'effect'), toRef(props, 'level'), props.size)
const image = computed(() => (url.value ? { backgroundImage: `url('${url.value}')` } : {}))

// Deux couches floues, la plus forte plus bas : le flou s'installe progressivement. Moyen = les valeurs de monocode.
const BLUR = { low: [4, 10], medium: [7, 18], high: [12, 30] } as const
const layers = computed(() => (props.blur ? BLUR[props.blur].map((radius) => ({ filter: `blur(${radius * props.scale}px)` })) : []))
</script>

<template>
  <div v-if="!url" class="absolute inset-0 animate-pulse bg-content/5 motion-reduce:animate-none" aria-hidden="true" />
  <!-- Fondu seulement si l'image arrive après coup (lancement, nouvel effet), comme monocode : déjà en cache, elle
       est là dès le premier rendu et Transition, sans `appear`, ne joue rien. -->
  <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-500 ease-out motion-reduce:transition-none">
    <div v-if="url" class="absolute inset-0" aria-hidden="true">
      <div class="absolute inset-0 bg-cover bg-center" :style="image" />
      <template v-if="blur">
        <div
          v-for="(layer, index) in layers"
          :key="index"
          class="absolute inset-0 bg-cover bg-center"
          :class="index === 0 ? 'background-blur-soft' : 'background-blur-strong'"
          :style="[image, layer]"
        />
        <div class="background-veil absolute inset-0" />
      </template>
    </div>
  </Transition>
</template>
