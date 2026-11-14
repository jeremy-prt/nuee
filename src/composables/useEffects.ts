import { computed, ref } from 'vue'
import { type AnimationKind, useAppearanceStore } from '@/stores/appearance'

const query = matchMedia('(prefers-reduced-motion: reduce)')
const reduced = ref(query.matches)
query.addEventListener('change', (event) => (reduced.value = event.matches))

// Effets décoratifs : chacun coupé par son réglage (Réglages › Apparence › Animations), tous par « Réduire les animations ».
export function useEffects(kind: AnimationKind) {
  const appearance = useAppearanceStore()
  return computed(() => appearance.animations[kind] && !reduced.value)
}

// Couleur d'une variable CSS lisible par un canvas, qui ne comprend ni `var()` ni toujours `color-mix()`.
export function cssColor(name: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}
