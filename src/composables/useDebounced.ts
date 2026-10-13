import { type Ref, ref, watch } from 'vue'

// Valeur qui suit `source` une fois la frappe arrêtée : une recherche ne repasse pas toute la liste à chaque lettre.
// Vidée, elle suit tout de suite.
export function useDebounced<T>(source: Ref<T>, delay = 150) {
  const value = ref(source.value) as Ref<T>
  let timer = 0
  watch(source, (next) => {
    clearTimeout(timer)
    if (!next) value.value = next
    else timer = window.setTimeout(() => (value.value = next), delay)
  })
  return value
}
