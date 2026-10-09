import { type DragSource, type PreviewRect, useDragStore } from '@/stores/drag'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useWorkspaceStore } from '@/stores/workspace'

// Distance avant que l'appui devienne un glisser : un simple clic reste un clic.
const THRESHOLD = 4
// Part d'un pane qui déclenche un dépôt sur le côté plutôt qu'au centre.
const EDGE = 0.3
// Taille des zones de dépôt des panneaux : à droite de toute la zone, en bas de la colonne centrale.
const DOCK_ZONE = { right: 0.3, bottom: 0.35 }

function rect(r: DOMRect, part: Partial<PreviewRect> = {}): PreviewRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height, ...part }
}

export function useLayoutDrag() {
  const drag = useDragStore()
  const layout = useLayoutStore()
  const workspace = useWorkspaceStore()

  function track(event: PointerEvent, source: DragSource, onMove: (x: number, y: number) => void, onDrop: () => void) {
    if (event.button !== 0) return
    const start = { x: event.clientX, y: event.clientY }
    let started = false

    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return
        started = true
        drag.source = source
        document.documentElement.style.cursor = 'grabbing'
      }
      onMove(e.clientX, e.clientY)
    }
    const finish = (apply: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', escape, true)
      document.documentElement.style.cursor = ''
      if (started && apply) onDrop()
      drag.reset()
    }
    const up = () => finish(true)
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', escape, true)
  }

  function reorderTab(id: string, x: number) {
    const others = [...document.querySelectorAll<HTMLElement>('[data-tab-id]')].filter((el) => el.dataset.tabId !== id)
    const before = others.find((el) => {
      const r = el.getBoundingClientRect()
      return x < r.left + r.width / 2
    })
    workspace.moveTab(id, before?.dataset.tabId ?? null)
  }

  function paneTarget(id: string, x: number, y: number) {
    drag.target = null
    drag.preview = null
    const canSplit = workspace.panes.length === 1 && workspace.contextTabs.length > 1

    for (const el of document.querySelectorAll<HTMLElement>('[data-pane-index]')) {
      const r = el.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
      const index = Number(el.dataset.paneIndex)
      const position = (x - r.left) / r.width
      const side = canSplit && position < EDGE ? 'left' : canSplit && position > 1 - EDGE ? 'right' : 'center'
      if (side === 'center' && workspace.panes[index] === id) return

      drag.target = { kind: 'pane', index, side }
      drag.preview =
        side === 'left'
          ? rect(r, { width: r.width / 2 })
          : side === 'right'
            ? rect(r, { left: r.left + r.width / 2, width: r.width / 2 })
            : rect(r)
      return
    }
  }

  function dockTarget(view: DockView, x: number, y: number) {
    drag.target = null
    drag.preview = null
    const area = document.getElementById('workspace-area')?.getBoundingClientRect()
    const column = document.getElementById('workspace-column')?.getBoundingClientRect()
    if (!area || !column) return

    const toRight = x > area.right - area.width * DOCK_ZONE.right && y > area.top
    const toBottom = !toRight && x >= column.left && y > column.bottom - column.height * DOCK_ZONE.bottom
    const position = toRight ? 'right' : toBottom ? 'bottom' : null
    if (!position || layout.views[view] === position) return

    drag.target = { kind: 'dock', position }
    drag.preview = toRight
      ? rect(area, { left: area.right - area.width * DOCK_ZONE.right, width: area.width * DOCK_ZONE.right })
      : rect(column, { top: column.bottom - column.height * DOCK_ZONE.bottom, height: column.height * DOCK_ZONE.bottom })
  }

  function startTabDrag(event: PointerEvent, id: string) {
    track(
      event,
      { kind: 'tab', id },
      (x, y) => {
        const strip = document.querySelector('[data-tab-strip]')?.getBoundingClientRect()
        if (strip && y >= strip.top && y <= strip.bottom) {
          drag.target = null
          drag.preview = null
          reorderTab(id, x)
        } else {
          paneTarget(id, x, y)
        }
      },
      () => {
        if (drag.target?.kind === 'pane') workspace.dropTab(id, drag.target.index, drag.target.side)
      },
    )
  }

  function startViewDrag(event: PointerEvent, view: DockView) {
    track(
      event,
      { kind: 'view', view },
      (x, y) => dockTarget(view, x, y),
      () => {
        if (drag.target?.kind === 'dock') layout.moveView(view, drag.target.position)
      },
    )
  }

  return { startTabDrag, startViewDrag }
}
