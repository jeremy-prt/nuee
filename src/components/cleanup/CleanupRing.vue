<script setup lang="ts">
import { computed } from 'vue'

// Anneau de l'écran Nettoyage. Au repos, en gris la mémoire occupée de l'ordinateur, en couleur la part des process de
// développement. Pendant le nettoyage, l'arc de couleur devient la progression ; à la fin, il se ferme en vert.
const props = defineProps<{ share: number; machine: number; progress: number; pace: number; phase: 'idle' | 'cleaning' | 'done' }>()

const RADIUS = 92
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function dash(ratio: number) {
  return `${Math.min(Math.max(ratio, 0), 1) * CIRCUMFERENCE} ${CIRCUMFERENCE}`
}

// Une part minuscule reste visible : un anneau vide laisserait croire que ces process ne pèsent rien.
const arc = computed(() => {
  if (props.phase === 'done') return dash(1)
  if (props.phase === 'cleaning') return dash(props.progress)
  return dash(props.share > 0 ? Math.max(props.share, 0.012) : 0)
})
const machineDash = computed(() => dash(props.machine))
</script>

<template>
  <div class="relative grid size-56 place-items-center" :data-phase="phase" :style="{ '--pace': `${pace}ms` }">
    <div class="glow absolute inset-6 rounded-full blur-2xl" aria-hidden="true" />
    <svg viewBox="0 0 200 200" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="100" cy="100" :r="RADIUS" fill="none" stroke-width="6" class="stroke-content/6" />
      <circle cx="100" cy="100" :r="RADIUS" fill="none" stroke-width="6" stroke-linecap="round" class="machine stroke-content/25" :stroke-dasharray="machineDash" />
      <circle cx="100" cy="100" :r="RADIUS" fill="none" stroke-width="6" stroke-linecap="round" class="arc" :stroke-dasharray="arc" />
    </svg>
    <div class="relative flex flex-col items-center px-4 text-center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.glow {
  background: var(--color-signal);
  opacity: 0.08;
  transition:
    opacity 400ms var(--motion-ease),
    background-color 400ms var(--motion-ease);
}

.machine {
  transition:
    stroke-dasharray 800ms var(--motion-ease),
    opacity 300ms var(--motion-ease);
}

.arc {
  stroke: var(--color-signal);
  transition:
    stroke-dasharray 450ms var(--motion-ease),
    stroke 400ms var(--motion-ease);
}

/* Pendant le nettoyage, l'arc avance au rythme des lignes : il ne s'arrête pas entre deux catégories. */
[data-phase='cleaning'] .arc {
  transition: stroke-dasharray var(--pace) linear;
}

[data-phase='cleaning'] .glow {
  opacity: 0.16;
}

[data-phase='cleaning'] .machine,
[data-phase='done'] .machine {
  opacity: 0;
}

[data-phase='done'] .arc {
  stroke: var(--color-success);
}

[data-phase='done'] .glow {
  background: var(--color-success);
  opacity: 0.14;
}

@media (prefers-reduced-motion: reduce) {
  .glow,
  .machine,
  .arc {
    transition: opacity 150ms linear;
  }
}
</style>
