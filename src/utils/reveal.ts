import { nextTick } from 'vue'

// Bloc qui vient de se déplier en bas d'une liste qui défile : la liste avance juste assez pour le montrer, sans faire
// sortir son intertitre (comme T3 Code). Après l'animation de UiCollapse : pendant, la liste n'a pas encore sa hauteur
// et le défilement reste bloqué.
export async function revealOpened(anchor: Element | null, contentId: string) {
  await nextTick()
  const content = document.getElementById(contentId)
  await Promise.allSettled(content?.getAnimations().map((animation) => animation.finished) ?? [])
  let scroller = anchor?.parentElement ?? null
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  if (!anchor || !content || !scroller) return
  const box = scroller.getBoundingClientRect()
  const top = anchor.getBoundingClientRect().top
  const bottom = content.getBoundingClientRect().top + content.scrollHeight
  const delta = Math.min(bottom - box.bottom + 8, top - box.top - 4)
  if (delta <= 0) return
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'instant' })
}
