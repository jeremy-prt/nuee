import { onScopeDispose, ref, watch, type Ref } from 'vue'

// Largeur suivie au pixel près : un graphique SVG se redessine à sa taille plutôt que d'étirer son texte.
export function useElementWidth(target: Ref<HTMLElement | null>) {
  const width = ref(0)
  const observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.round(entry.contentRect.width)
  })
  watch(
    target,
    (element, before) => {
      if (before) observer.unobserve(before)
      if (element) observer.observe(element)
    },
    { immediate: true },
  )
  onScopeDispose(() => observer.disconnect())
  return width
}
