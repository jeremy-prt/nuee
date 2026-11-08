<script setup lang="ts">
import type { Component } from 'vue'

// État vide d'un volet, comme T3 Code : l'icône dans une carte posée sur une autre, un titre, une phrase d'aide, puis
// ce qu'on peut faire (slot).
defineProps<{ icon: Component; title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center">
    <div class="flex flex-col items-center gap-3">
      <!-- Deux cartes en éventail derrière l'icône, comme T3 Code. Fonds légers plutôt qu'opaques (la fenêtre transparente
           reste visible) ; le flou de la carte de devant gomme les bords de celles de derrière. -->
      <span class="relative mb-3 grid size-10 place-items-center" aria-hidden="true">
        <span class="absolute inset-0 origin-bottom-left -translate-x-0.5 -rotate-10 scale-84 rounded-lg border border-stroke bg-content/4" />
        <span class="absolute inset-0 origin-bottom-right translate-x-0.5 rotate-10 scale-84 rounded-lg border border-stroke bg-content/4" />
        <span class="relative grid size-10 place-items-center rounded-lg border border-stroke bg-content/8 shadow-sm backdrop-blur-md">
          <component :is="icon" class="size-4.5 text-muted" />
        </span>
      </span>
      <h2 class="text-base font-semibold text-content">{{ title }}</h2>
      <p v-if="description" class="max-w-72 text-sm text-muted">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
