import { type DragSource, type PreviewRect, useDragStore } from '@/stores/drag'
import { useI18n } from 'vue-i18n'
import { useProjectActions } from '@/composables/useProjectActions'
import { useTabTitle } from '@/composables/useTabTitle'
import { type DockView, type DockZone, useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Distance avant que l'appui devienne un glisser : un simple clic reste un clic.
const THRESHOLD = 4
// Part d'un pane qui déclenche un dépôt sur le côté plutôt qu'au centre.
const EDGE = 0.3

function rect(r: DOMRect, part: Partial<PreviewRect> = {}): PreviewRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height, ...part }
}

export function useLayoutDrag() {
  const drag = useDragStore()
  const workspace = useWorkspaceStore()
  const projects = useProjectsStore()
  const actions = useProjectActions()
  const layout = useLayoutStore()
  const { locale } = useI18n()
  const { tabTitle } = useTabTitle()

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
    // Les épinglés restent en tête : on ne range qu'entre les autres.
    const others = [...document.querySelectorAll<HTMLElement>('[data-tab-id]:not([data-tab-pinned])')].filter((el) => el.dataset.tabId !== id)
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

  // Sessions de la liste. Vers Épinglées : un trait montre la place exacte, l'ordre des épinglées est libre. Hors
  // d'Épinglées, une épinglée perd son épingle et le trait montre où le tri la range. Ailleurs, rien.
  function chatTarget(id: string, x: number, y: number) {
    const tab = workspace.tabs.find((item) => item.id === id)
    const hit = document.elementFromPoint(x, y)
    if (!tab || !hit?.closest('[data-chat-list]')) {
      drag.target = null
      drag.preview = null
      return
    }
    const pinnedZone = hit.closest('[data-chat-zone="pinned"]')
    if (!pinnedZone && !tab.pinned) {
      drag.target = null
      drag.preview = null
      return
    }
    const zone = document.querySelector(`[data-chat-zone="${pinnedZone ? 'pinned' : 'recent'}"]`)
    const rows = [...(zone?.querySelectorAll<HTMLElement>('[data-chat-id]') ?? [])].filter((el) => el.dataset.chatId !== id)
    let before: HTMLElement | undefined
    if (pinnedZone) {
      before = rows.find((el) => {
        const r = el.getBoundingClientRect()
        return y < r.top + r.height / 2
      })
      // Déjà à cette place parmi les épinglées : rien ne changerait.
      if (tab.pinned) {
        const all = [...(zone?.querySelectorAll<HTMLElement>('[data-chat-id]') ?? [])]
        const next = all[all.findIndex((el) => el.dataset.chatId === id) + 1]
        if (next === before) {
          drag.target = null
          drag.preview = null
          return
        }
      }
    } else {
      before = rows.find((el) => comesBefore(tab, workspace.tabs.find((item) => item.id === el.dataset.chatId)))
    }
    drag.target = { kind: 'chat', pinned: !!pinnedZone, before: before?.dataset.chatId ?? null }
    const last = rows.at(-1)?.getBoundingClientRect() ?? zone?.querySelector('h2')?.getBoundingClientRect()
    const r = before?.getBoundingClientRect()
    const top = r ? r.top - 1 : (last?.bottom ?? 0) + 1
    const width = (r ?? last)?.width ?? 0
    const left = (r ?? last)?.left ?? 0
    drag.preview = { left, top, width, height: 0, line: true }
  }

  // Ordre de la liste des sessions (ShellChatList) : récentes d'abord, ou par nom.
  function comesBefore(tab: Tab, other: Tab | undefined) {
    if (!other) return false
    if (layout.sessionSort === 'activity') return tab.updatedAt > other.updatedAt
    if (layout.sessionSort === 'created') return tab.createdAt > other.createdAt
    return new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' }).compare(tabTitle(tab), tabTitle(other)) < 0
  }

  function startChatDrag(event: PointerEvent, id: string) {
    const label = tabTitle(workspace.tabs.find((item) => item.id === id)!)
    track(
      event,
      { kind: 'chat', id },
      (x, y) => {
        drag.ghost = { x, y, label }
        chatTarget(id, x, y)
      },
      () => {
        const tab = workspace.tabs.find((item) => item.id === id)
        const target = drag.target
        if (!tab || target?.kind !== 'chat') return
        if (target.pinned) {
          const order = [...document.querySelectorAll<HTMLElement>('[data-chat-zone="pinned"] [data-chat-id]')]
            .map((el) => el.dataset.chatId!)
            .filter((other) => other !== id)
          const at = target.before ? order.indexOf(target.before) : -1
          order.splice(at === -1 ? order.length : at, 0, id)
          layout.pinnedOrder = order
        } else {
          layout.pinnedOrder = layout.pinnedOrder.filter((other) => other !== id)
        }
        if (target.pinned !== tab.pinned) actions.togglePin(tab)
      },
    )
  }

  // Onglets du panneau de droite, comme les groupes d'éditeurs de VS Code : tiré sur le panneau, il montre ses zones
  // de dépôt (`ShellDockSplit`, `data-dock-drop`) ; lâché dans l'une, il s'y affiche. Ailleurs, rien.
  function dockTarget(x: number, y: number) {
    drag.target = null
    for (const el of document.querySelectorAll<HTMLElement>('[data-dock-drop]')) {
      const r = el.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
      drag.target = { kind: 'dock', at: el.dataset.dockDrop as DockZone }
      return
    }
  }

  function startDockDrag(event: PointerEvent, key: string, view: DockView, label: string, onDrop: () => void) {
    let last = { x: event.clientX, y: event.clientY }
    track(
      event,
      { kind: 'dock', id: key, view },
      (x, y) => {
        last = { x, y }
        drag.ghost = { x, y, label }
        dockTarget(x, y)
      },
      () => {
        // Les zones n'apparaissent qu'au rendu qui suit le début du glisser : un geste rapide n'en a vu aucune.
        dockTarget(last.x, last.y)
        const target = drag.target
        if (target?.kind !== 'dock') return
        onDrop()
        layout.placeView(view, target.at)
      },
    )
  }

  return { startTabDrag, startProjectDrag, startChatDrag, startDockDrag }
}
