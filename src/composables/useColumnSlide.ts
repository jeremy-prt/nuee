import { nextTick, watch } from 'vue'
import { useAppearanceStore } from '@/stores/appearance'
import { RAIL_COLLAPSED_WIDTH, type SlideColumn, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'
import { motion } from '@/utils/motion'

// Colonnes qui glissent, comme monocode : seules les largeurs de la colonne et des zones de la barre de titre s'animent,
// le contenu de la colonne garde sa largeur et suit le bord. Les messages hors de vue sont gelés à leur hauteur pendant
// le mouvement : seul ce qui est à l'écran se remet en page à chaque image.

const widthOf = (element: Element) => element.getBoundingClientRect().width

// Une hauteur d'écran de marge : en s'élargissant, les messages raccourcissent et ceux du dessous remontent.
function freezeOffscreenRows() {
  const frozen: HTMLElement[] = []
  for (const list of document.querySelectorAll<HTMLElement>('[data-slide-rows]')) {
    const scroller = list.parentElement
    if (!scroller || list.closest('.view-parked')) continue
    const view = scroller.getBoundingClientRect()
    const rows = [...list.children] as HTMLElement[]
    const boxes = rows.map((row) => row.getBoundingClientRect())
    rows.forEach((row, index) => {
      const box = boxes[index]!
      if (box.bottom > view.top - view.height && box.top < view.bottom + view.height) return
      row.style.containIntrinsicHeight = `${box.height}px`
      row.style.contentVisibility = 'hidden'
      frozen.push(row)
    })
  }
  return frozen
}

function contentOf(zone: HTMLElement) {
  return zone.querySelector<HTMLElement>(':scope > [data-slide-content], :scope > [data-slide-clip] > [data-slide-content]')
}

function setSliding(element: HTMLElement, anchor: 'start' | 'end', content: number) {
  element.dataset.sliding = anchor
  element.style.setProperty('--slide-content', `${content}px`)
}

function clearSliding(element: HTMLElement) {
  delete element.dataset.sliding
  element.style.removeProperty('--slide-content')
}

function thaw(row: HTMLElement) {
  row.style.contentVisibility = ''
  row.style.containIntrinsicHeight = ''
}

export function useColumnSlide() {
  const layout = useLayoutStore()
  const appearance = useAppearanceStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const stops: Partial<Record<SlideColumn, (restarting?: boolean) => void>> = {}
  const runs: Record<SlideColumn, number> = { rail: 0, panel: 0, dock: 0 }

  // Appelé avant la mise à jour du DOM : on lit l'état de départ, la colonne qui se ferme reste affichée (`moving`), et
  // l'état d'arrivée se lit après. Un mouvement inversé repart de la largeur en cours.
  async function slide(column: SlideColumn, opening: boolean, anchor: 'start' | 'end', closed: number) {
    const timing = motion(opening ? 'open' : 'close')
    if (!timing.duration) {
      stops[column]?.()
      return
    }
    const run = ++runs[column]
    const selector = `[data-slide-column="${column}"]`
    const current = document.querySelector<HTMLElement>(selector)
    const from = current ? widthOf(current) : closed
    const zones = [...document.querySelectorAll<HTMLElement>('[data-slide-zone]')].map((element) => {
      const content = contentOf(element)
      return { element, before: widthOf(element), contentBefore: content ? widthOf(content) : 0 }
    })
    stops[column]?.(true)
    const frozen = freezeOffscreenRows()
    layout.moving[column] = true
    // Un rendu en erreur (dev) rejette la promesse : le mouvement va quand même au bout et rend la colonne.
    await nextTick().catch(() => {})
    const element = document.querySelector<HTMLElement>(selector)
    if (run !== runs[column]) return
    if (!element) {
      layout.moving[column] = false
      frozen.forEach(thaw)
      return
    }

    const full = widthOf(element)
    const to = opening ? full : closed
    setSliding(element, anchor, full)

    const slid = [element]
    const animations: Animation[] = []
    for (const zone of zones) {
      // Déjà prise par le mouvement d'une autre colonne.
      if (!zone.element.isConnected || zone.element.dataset.sliding) continue
      const content = contentOf(zone.element)
      if (content) setSliding(zone.element, 'start', Math.max(zone.contentBefore, widthOf(content)))
      const after = widthOf(zone.element)
      if (Math.abs(after - zone.before) < 0.5) {
        clearSliding(zone.element)
        continue
      }
      if (content) slid.push(zone.element)
      animations.push(zone.element.animate([{ width: `${zone.before}px` }, { width: `${after}px` }], timing))
    }
    const main = element.animate([{ width: `${from}px` }, { width: `${to}px` }], { ...timing, fill: 'forwards' })
    animations.push(main)

    let stopped = false
    const stop = (restarting = false) => {
      if (stopped) return
      stopped = true
      if (stops[column] === stop) delete stops[column]
      frozen.forEach(thaw)
      slid.forEach(clearSliding)
      if (restarting) {
        animations.forEach((animation) => animation.cancel())
        return
      }
      layout.moving[column] = false
      // La dernière image tient jusqu'à ce que Vue ait posé l'état final : la colonne fermée a quitté la page.
      nextTick(() => animations.forEach((animation) => animation.cancel()))
    }
    main.onfinish = () => stop()
    stops[column] = stop
  }

  const menu = () => appearance.layout === 'menu'

  watch(
    () => layout.rail.expanded,
    (expanded) => slide('rail', expanded, menu() ? 'end' : 'start', menu() ? 0 : RAIL_COLLAPSED_WIDTH),
  )
  watch(
    () => layout.panel.open,
    (open) => {
      if (!menu() && navigation.hasPanel) slide('panel', open, 'end', 0)
    },
  )
  // Changer d'onglet rend à la session son propre panneau : sans mouvement.
  watch(
    () => [layout.right.open, workspace.activeTabId, navigation.view] as const,
    ([open, id, view], [wasOpen, wasId, wasView]) => {
      if (open !== wasOpen && id === wasId && view === wasView && view === 'chats') slide('dock', open, 'start', 0)
    },
  )
}
