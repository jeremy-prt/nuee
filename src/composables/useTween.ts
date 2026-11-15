import { onScopeDispose, ref, watch, type WatchSource } from 'vue'

// Valeur qui glisse vers sa cible au lieu de sauter (compteur de l'écran Nettoyage). Sans mouvement (réglage du
// système), elle prend la cible tout de suite.
export function useTween(target: WatchSource<number>, duration: number | (() => number) = 900) {
  const value = ref(0)
  let frame = 0
  watch(
    target,
    (to) => {
      cancelAnimationFrame(frame)
      const from = value.value
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
        value.value = to
        return
      }
      const length = typeof duration === 'function' ? duration() : duration
      const start = performance.now()
      const step = (now: number) => {
        const progress = Math.min((now - start) / length, 1)
        value.value = from + (to - from) * (1 - (1 - progress) ** 3)
        if (progress < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    },
    { immediate: true },
  )
  onScopeDispose(() => cancelAnimationFrame(frame))
  return value
}
