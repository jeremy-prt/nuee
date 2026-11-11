import { type InjectionKey, onBeforeUnmount, ref } from 'vue'

type Point = [number, number]
export type Area = { x: number; y: number; width: number; height: number }

// Zone permise aux sous-menus imbriqués (`UiMenuSub`) : sans elle, reka ouvre le second niveau à droite, par-dessus le
// volet, alors que le premier s'est ouvert à gauche. reka ne type que des éléments, floating-ui prend aussi un rectangle.
export const hoverMenuArea: InjectionKey<() => Area | null> = Symbol('hover-menu-area')
// `replaced` : un autre sous-menu prend la place, le focus ne revient pas sur cette ligne (il fermerait le nouveau).
export type CloseReason = 'pointer' | 'replaced' | 'other'

const OPEN_DELAY = 100
const CLOSE_DELAY = 150
// Temps laissé pour rejoindre le sous-menu en diagonale, à travers les lignes voisines.
const GRACE = 400

// Un seul sous-menu ouvert à la fois dans toute l'app.
let active: { id: symbol; close: () => void; holds: (point: Point) => boolean } | null = null

function inside([x, y]: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// Sous-menu d'une ligne ouvert au survol, comme ceux de l'app Claude : il s'ouvre après un court arrêt sur `zone`, se
// referme quand le pointeur quitte la ligne et le menu, sauf s'il file vers le menu (triangle de tolérance, comme
// reka entre un élément et son sous-menu). `content` : le menu affiché. Ouvert au clavier, seul le clavier le ferme.
export function useHoverMenu(zone: () => HTMLElement | null | undefined, content: () => HTMLElement | null, disabled: () => boolean) {
  const id = Symbol('hover-menu')
  const open = ref(false)
  // Ouvert ou repris à la souris : le pointeur qui s'en va le ferme, le focus n'y entre pas.
  const byPointer = ref(false)
  let reason: CloseReason = 'other'
  let focusInside = false
  let hovering = false
  let openTimer = 0
  let closeTimer = 0
  let grace: { polygon: Point[]; until: number } | null = null
  let last: Point = [0, 0]

  const holds = (point: Point) => !!grace && Date.now() < grace.until && inside(point, grace.polygon)
  const within = (target: EventTarget | null) => {
    const el = target instanceof Element ? target : null
    return !!el && (!!zone()?.contains(el) || !!el.closest('[data-reka-menu-content]'))
  }

  function follow() {
    byPointer.value = true
    document.addEventListener('pointermove', track, { passive: true })
  }

  function show(pointer: boolean) {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    closeTimer = 0
    if (active && active.id !== id) active.close()
    active = { id, close: () => hide('replaced'), holds }
    if (!open.value) byPointer.value = false
    if (pointer) follow()
    open.value = true
  }

  function hide(why: CloseReason) {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    closeTimer = 0
    grace = null
    document.removeEventListener('pointermove', track)
    if (active?.id === id) active = null
    if (!open.value) return
    reason = why
    focusInside = !!content()?.contains(document.activeElement)
    open.value = false
  }

  // Un autre sous-menu garde la main tant que le pointeur file vers lui.
  function tryOpen() {
    if (!hovering || disabled()) return
    if (active && active.id !== id && active.holds(last)) {
      openTimer = window.setTimeout(tryOpen, 50)
      return
    }
    show(true)
  }

  function check() {
    closeTimer = 0
    if (within(document.elementFromPoint(...last))) return
    if (holds(last)) {
      closeTimer = window.setTimeout(check, Math.max(0, grace!.until - Date.now()))
      return
    }
    hide('pointer')
  }

  function track(event: PointerEvent) {
    last = [event.clientX, event.clientY]
    if (within(event.target)) {
      clearTimeout(closeTimer)
      closeTimer = 0
      if (event.target instanceof Element && event.target.closest('[data-reka-menu-content]')) grace = null
      return
    }
    if (holds(last)) {
      clearTimeout(closeTimer)
      closeTimer = window.setTimeout(check, Math.max(0, grace!.until - Date.now()))
    } else if (!closeTimer) closeTimer = window.setTimeout(check, CLOSE_DELAY)
  }

  function onEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || disabled()) return
    hovering = true
    last = [event.clientX, event.clientY]
    if (open.value) {
      if (!byPointer.value) follow()
      return
    }
    clearTimeout(openTimer)
    openTimer = window.setTimeout(tryOpen, active ? 0 : OPEN_DELAY)
  }

  function onMove(event: PointerEvent) {
    last = [event.clientX, event.clientY]
  }

  function onLeave(event: PointerEvent) {
    hovering = false
    clearTimeout(openTimer)
    if (!open.value || !byPointer.value) return
    const box = content()?.getBoundingClientRect()
    if (!box) return
    const [x, y] = [event.clientX, event.clientY]
    // Triangle du point de sortie (un peu en arrière) aux deux coins du menu qui font face à la ligne.
    const left = box.right <= x + 1
    const edge = left ? box.right : box.left
    const back = left ? 5 : -5
    grace = { polygon: [[x + back, y], [edge, box.top], [edge, box.bottom]], until: Date.now() + GRACE }
  }

  // Ouvert au clavier puis rejoint à la souris : il suit désormais le pointeur.
  function onContentEnter(event: PointerEvent) {
    if (event.pointerType === 'mouse' && open.value && !byPointer.value) follow()
  }

  onBeforeUnmount(() => hide('other'))

  return {
    open,
    byPointer,
    show,
    hide,
    onEnter,
    onMove,
    onLeave,
    onContentEnter,
    // Lu à la fermeture : rendre le focus à la ligne, ou le laisser où il est.
    closed: () => ({ reason, focusInside }),
  }
}
