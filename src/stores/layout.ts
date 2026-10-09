import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'

export type DockPosition = 'right' | 'bottom'
export type DockView = 'terminal' | 'changes' | 'files'

interface Dock {
  open: boolean
  size: number
  active: DockView | null
}

interface LayoutState {
  rail: { open: boolean; width: number }
  conversations: { open: boolean; width: number }
  right: Dock
  bottom: Dock
  views: Record<DockView, DockPosition>
}

const STORAGE_KEY = 'nuee.layout.v2'

export const SIZES = {
  rail: { min: 160, max: 320, defaultSize: 180 },
  conversations: { min: 200, max: 420, defaultSize: 240 },
  right: { min: 280, max: 800, defaultSize: 420 },
  bottom: { min: 160, max: 600, defaultSize: 260 },
}

function defaults(): LayoutState {
  return {
    rail: { open: true, width: SIZES.rail.defaultSize },
    conversations: { open: true, width: SIZES.conversations.defaultSize },
    right: { open: false, size: SIZES.right.defaultSize, active: 'changes' },
    bottom: { open: false, size: SIZES.bottom.defaultSize, active: 'terminal' },
    views: { terminal: 'bottom', changes: 'right', files: 'right' },
  }
}

function load(): LayoutState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? { ...defaults(), ...JSON.parse(saved) } : defaults()
  } catch {
    return defaults()
  }
}

export const useLayoutStore = defineStore('layout', () => {
  const state = reactive(load())

  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Stockage indisponible : la disposition reste valable pour la session.
      }
    },
    { deep: true },
  )

  function viewsIn(position: DockPosition) {
    return (Object.keys(state.views) as DockView[]).filter((view) => state.views[view] === position)
  }

  function toggleRail() {
    state.rail.open = !state.rail.open
  }

  function toggleConversations() {
    state.conversations.open = !state.conversations.open
  }

  function toggleDock(position: DockPosition) {
    const dock = state[position]
    if (!viewsIn(position).length) return
    dock.open = !dock.open
  }

  function moveView(view: DockView, to: DockPosition) {
    const from = state.views[view]
    if (from === to) return
    state.views[view] = to
    state[to].active = view
    state[to].open = true

    const remaining = viewsIn(from)
    if (state[from].active === view) state[from].active = remaining[0] ?? null
    if (!remaining.length) state[from].open = false
  }

  return { ...toRefs(state), viewsIn, toggleRail, toggleConversations, toggleDock, moveView }
})
