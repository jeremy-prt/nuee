import { type DragSource, type PreviewRect, useDragStore } from '@/stores/drag'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
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
  const projects = useProjectsStore()

  function track(event: PointerEvent, source: DragSource, onMove: (x: number, y: number) => void, onDrop: () => void) {
    if (event.button !== 0) return
    const start = { x: event.clientX, y: event.clientY }
    let started = false

    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return
        started = true
        drag.source = source
        document.documentElement.classList.add('is-dragging')
      }
      onMove(e.clientX, e.clientY)
    }
    const finish = (apply: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', escape, true)
      document.documentElement.classList.remove('is-dragging')
      if (started && apply) onDrop()
      // Le relâché d'un glisser ne doit pas valoir un clic sur l'élément d'arrivée (ouvrir un projet, un onglet). Le
      // clic suit le relâché dans la même tâche ; sans clic (relâché hors de l'élément), l'écouteur part au tour suivant.
      if (started) {
        const swallow = (e: MouseEvent) => e.stopPropagation()
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
      }
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

  // Projets de la barre latérale, comme les panneaux : rien ne bouge avant le relâché, un aperçu montre où le projet
  // ira. Sur l'en-tête d'un groupe (cadre), il y entre ; entre deux lignes (trait), il prend cette place avec son
  // groupe et son épingle ; sous le titre Épinglés ou Projets, il passe en tête de la section.
  function projectTarget(id: string, x: number, y: number) {
    const hit = document.elementFromPoint(x, y)
    const el = hit?.closest<HTMLElement>('[data-group-id], [data-project-row], [data-projects-heading], [data-pinned-heading]')
    // Dans l'espace entre deux lignes, l'aperçu reste où il était : il ne clignote pas.
    if (!el && hit?.closest('#shell-rail')) return
    drag.target = null
    drag.preview = null
    if (!el) return
    const r = el.getBoundingClientRect()
    const line = (top: number) => ({ left: r.left, top, width: r.width, height: 0, line: true })
    const others = projects.projects.filter((item) => item.id !== id)

    if (el.dataset.groupId) {
      drag.target = { kind: 'project', group: el.dataset.groupId, pinned: false, before: null }
      drag.preview = rect(r)
    } else if (el.dataset.projectsHeading !== undefined) {
      drag.target = { kind: 'project', group: null, pinned: false, before: projects.ungrouped.find((item) => item.id !== id)?.id ?? null }
      drag.preview = line(r.bottom)
    } else if (el.dataset.pinnedHeading !== undefined) {
      drag.target = { kind: 'project', group: null, pinned: true, before: projects.pinned.find((item) => item.id !== id)?.id ?? null }
      drag.preview = line(r.bottom)
    } else {
      const target = projects.byId(el.dataset.projectRow ?? null)
      if (!target || target.id === id) return
      const after = y > r.top + r.height / 2
      const before = after ? (others[others.indexOf(target) + 1]?.id ?? null) : target.id
      drag.target = { kind: 'project', group: target.group, pinned: target.pinned, before }
      drag.preview = line(after ? r.bottom + 1 : r.top - 1)
    }
  }

  function startProjectDrag(event: PointerEvent, id: string) {
    track(
      event,
      { kind: 'project', id },
      (x, y) => projectTarget(id, x, y),
      () => {
        if (drag.target?.kind === 'project') projects.moveProject(id, drag.target)
      },
    )
  }

  return { startTabDrag, startViewDrag, startProjectDrag }
}
