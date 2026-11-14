<script setup lang="ts">
import { onMounted } from 'vue'

// Éclat joué une fois à l'activation du mode Orchestre, d'après monocode : le bord violet se dessine depuis la puce,
// un reflet balaie le cadre, quelques points partent, puis un halo allume le bord. Retiré dès la fin, rien ne tourne
// au repos ; le cadre prend alors sa couleur fixe (ChatComposer).
const props = defineProps<{ x: number; y: number }>()
const emit = defineEmits<{ done: [] }>()

const DURATION = 1350
const tones = ['var(--color-violet)', 'color-mix(in srgb, var(--color-violet) 55%, white)']

// Vers le haut surtout : sous le champ, il n'y a souvent que le bord de la fenêtre.
const COUNT = 8
const sparks = Array.from({ length: COUNT }, (_, index) => {
  const angle = (-165 + (index / (COUNT - 1)) * 150 + (Math.random() - 0.5) * 16) * (Math.PI / 180)
  const distance = 20 + Math.random() * 35
  return {
    left: `${props.x}px`,
    top: `${props.y}px`,
    '--dx': `${Math.cos(angle) * distance}px`,
    '--dy': `${Math.sin(angle) * distance}px`,
    '--size': `${2 + Math.random() * 1.5}px`,
    '--delay': `${Math.round(Math.random() * 60)}ms`,
    '--tone': tones[index % tones.length],
  }
})

onMounted(() => setTimeout(() => emit('done'), DURATION))
</script>

<template>
  <div class="orchestra-burst" aria-hidden="true">
    <span class="mode-reveal" :style="{ '--x': `${x}px`, '--y': `${y}px`, '--tone': 'var(--color-violet)' }" />
    <span class="orchestra-burst-halo" />
    <span class="orchestra-burst-frame" />
    <span class="orchestra-burst-ring" :style="{ left: `${x}px`, top: `${y}px` }" />
    <span v-for="(spark, index) in sparks" :key="index" class="orchestra-spark" :style="spark" />
  </div>
</template>
