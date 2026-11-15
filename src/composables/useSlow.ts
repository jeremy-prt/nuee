import { onScopeDispose, reactive, ref, watch, type WatchSource } from 'vue'

// Chargements en cours dans les composants montés : l'écran de démarrage attend qu'il n'en reste aucun.
const pendings = reactive(new Set<symbol>())

export function anyPending() {
  return pendings.size > 0
}

// Vrai seulement quand `pending` dure plus de `delay` : une lecture rapide ne fait pas clignoter de squelette.
export function useSlow(pending: WatchSource<boolean>, delay = 150) {
  const slow = ref(false)
  const token = Symbol()
  let timer = 0
  watch(
    pending,
    (value) => {
      clearTimeout(timer)
      slow.value = false
      if (value) {
        pendings.add(token)
        timer = window.setTimeout(() => (slow.value = true), delay)
      } else pendings.delete(token)
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    clearTimeout(timer)
    pendings.delete(token)
  })
  return slow
}
