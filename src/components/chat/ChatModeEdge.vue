<script setup lang="ts">
import { type FrameTone, frameLook } from '@/components/chat/composerFrame'

// Bord du champ qui passe à la teinte d'un mode en fondu croisé, posé sur le cadre flouté pendant que le sien est
// transparent. Seule l'opacité s'anime : un calque composité, sans repeindre l'ombre ni refaire le flou à chaque image.
defineProps<{ from: FrameTone; to: FrameTone }>()
const emit = defineEmits<{ done: [] }>()
</script>

<template>
  <span class="mode-edge" aria-hidden="true">
    <span class="mode-edge-from rounded-2xl border" :class="frameLook[from]" />
    <span class="mode-edge-to rounded-2xl border" :class="frameLook[to]" @animationend="emit('done')" @animationcancel="emit('done')" />
  </span>
</template>
