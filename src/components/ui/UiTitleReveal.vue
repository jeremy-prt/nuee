<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEffects } from '@/composables/useEffects'

// Titre donné par l'agent : il se dévoile de gauche à droite (`.title-reveal` de main.css, coupé avec les effets
// d'interface). Seulement au passage du titre provisoire au titre généré, ni au montage ni quand on renomme.
const props = defineProps<{ title: string | null; fallback: string }>()
const effects = useEffects('interface')
const revealing = ref(false)

watch(
  () => props.title,
  (now, before) => {
    if (now && before === null && effects.value) revealing.value = true
  },
)
</script>

<template>
  <span :class="{ 'title-reveal': revealing }" @animationend="revealing = false">{{ title ?? fallback }}</span>
</template>
