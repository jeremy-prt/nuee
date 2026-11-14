import { onScopeDispose, ref, watch, type WatchSource } from 'vue'

// Vrai seulement quand `pending` dure plus de `delay` : une lecture rapide ne fait pas clignoter de squelette.
export function useSlow(pending: WatchSource<boolean>, delay = 150) {
  const slow = ref(false)
  let timer = 0
  watch(
    pending,
    (value) => {
      clearTimeout(timer)
      slow.value = false
      if (value) timer = window.setTimeout(() => (slow.value = true), delay)
    },
    { immediate: true },
  )
  onScopeDispose(() => clearTimeout(timer))
  return slow
}
