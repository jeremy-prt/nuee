import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue'

// Longue liste affichée par pages : les premières lignes tout de suite, la page suivante quand la ligne témoin
// (`sentinel`, posée après la liste avec `:key="limit"`) devient visible en défilant. La clé recrée le témoin à chaque
// page : resté visible, l'ancien ne se signalerait plus. `reset` ramène à la première page (autre projet…).
export function useProgressiveList<T>(list: Ref<readonly T[]>, reset: () => unknown, page = 40) {
  const limit = ref(page)
  const shown = computed(() => list.value.slice(0, limit.value))
  const more = computed(() => list.value.length > limit.value)
  const sentinel = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null

  watch(sentinel, (el) => {
    observer?.disconnect()
    if (!el) return
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) limit.value += page
    })
    observer.observe(el)
  })
  watch(reset, () => (limit.value = page))
  onBeforeUnmount(() => observer?.disconnect())

  return { shown, more, limit, sentinel }
}
