<script setup lang="ts">
import { onMounted } from 'vue'

// Éclat joué une fois à l'activation du mode Orchestre, d'après monocode : un reflet balaie le cadre, un halo
// s'allume puis s'éteint, des étincelles partent de la puce du mode. Retiré dès la fin, rien ne tourne au repos.
const props = defineProps<{ x: number; y: number }>()
const emit = defineEmits<{ done: [] }>()

const DURATION = 1100
const tones = ['var(--color-violet)', 'color-mix(in srgb, var(--color-violet) 55%, white)', 'var(--color-mention)']

// Vers le haut surtout : sous le champ, il n'y a souvent que le bord de la fenêtre.
const COUNT = 22
const sparks = Array.from({ length: COUNT }, (_, index) => {
  const angle = (-175 + (index / (COUNT - 1)) * 180 + (Math.random() - 0.5) * 12) * (Math.PI / 180)
  const distance = 50 + Math.random() * 100
  const streak = index % 3 === 0
  return {
    streak,
    style: {
      left: `${props.x}px`,
      top: `${props.y}px`,
      '--dx': `${Math.cos(angle) * distance}px`,
      '--dy': `${Math.sin(angle) * distance}px`,
      '--turn': `${angle}rad`,
      '--size': `${streak ? 2 : 3 + Math.random() * 3.5}px`,
      '--delay': `${Math.round(Math.random() * 90)}ms`,
      '--tone': tones[index % tones.length],
    },
  }
})

onMounted(() => setTimeout(() => emit('done'), DURATION))
</script>

<template>
  <div class="orchestra-burst" aria-hidden="true">
    <span class="orchestra-burst-frame" />
    <span class="orchestra-burst-ring" :style="{ left: `${x}px`, top: `${y}px` }" />
    <span v-for="(spark, index) in sparks" :key="index" class="orchestra-spark" :data-streak="spark.streak || undefined" :style="spark.style" />
  </div>
</template>
