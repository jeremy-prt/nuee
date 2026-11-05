import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'

export type DockView = 'tasks' | 'terminal' | 'changes' | 'browser' | 'files'

// Ordre des icônes de la barre de titre.
export const DOCK_VIEWS: DockView[] = ['tasks', 'terminal', 'changes', 'browser', 'files']

export type SessionSort = 'activity' | 'created' | 'name'

// Panneau de droite, comme l'app Claude : un ou deux volets empilés, celui du haut en premier.
interface Dock {
  open: boolean
  size: number
  panes: DockView[]
  // Hauteur du volet du haut quand il y en a deux.
  split: number
}

interface LayoutState {
  rail: { expanded: boolean; width: number }
  panel: { open: boolean; width: number }
  right: Dock
  sessionSort: SessionSort
}

const STORAGE_KEY = 'nuee.layout.v5'

export const RAIL_COLLAPSED_WIDTH = 48

export const SIZES = {
  // Même largeur dans les deux dispositions : en « Projets en menu », la barre porte aussi les sessions.
  rail: { min: 180, max: 420, defaultSize: 240 },
  panel: { min: 200, max: 420, defaultSize: 240 },
  right: { min: 280, max: 800, defaultSize: 420 },
  split: { min: 120, max: 1200, defaultSize: 320 },
}

function defaults(): LayoutState {
  return {
    rail: { expanded: true, width: SIZES.rail.defaultSize },
    panel: { open: true, width: SIZES.panel.defaultSize },
    right: { open: false, size: SIZES.right.defaultSize, panes: ['changes'], split: SIZES.split.defaultSize },
    sessionSort: 'activity',
  }
}

function load(): LayoutState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const state: LayoutState = saved ? { ...defaults(), ...JSON.parse(saved) } : defaults()
    // Disposition d'avant les volets empilés (volet du bas, onglets) : on garde la largeur.
    if (!Array.isArray(state.right.panes)) state.right = { ...defaults().right, size: state.right.size }
    state.right.panes = state.right.panes.filter((view) => DOCK_VIEWS.includes(view))
    const legacy = state as LayoutState & { bottom?: unknown; views?: unknown }
    delete legacy.bottom
    delete legacy.views
    // Une largeur enregistrée avant un changement de minimum reste dans les bornes actuelles.
    state.rail.width = Math.min(SIZES.rail.max, Math.max(SIZES.rail.min, state.rail.width))
    return state
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

  function toggleRail() {
    state.rail.expanded = !state.rail.expanded
  }

  function togglePanel() {
    state.panel.open = !state.panel.open
  }

  function isShown(view: DockView) {
    return state.right.open && state.right.panes.includes(view)
  }

  function toggleRight() {
    if (!state.right.panes.length) state.right.panes = ['changes']
    state.right.open = !state.right.open
  }

  // Ouvre le volet sous celui déjà affiché ; avec deux volets, il remplace celui du bas.
  function showView(view: DockView) {
    const dock = state.right
    if (!dock.open) dock.panes = []
    dock.open = true
    if (dock.panes.includes(view)) return
    if (dock.panes.length < 2) dock.panes.push(view)
    else dock.panes[1] = view
  }

  function hideView(view: DockView) {
    const dock = state.right
    dock.panes = dock.panes.filter((item) => item !== view)
    if (!dock.panes.length) dock.open = false
  }

  function toggleView(view: DockView) {
    if (isShown(view)) hideView(view)
    else showView(view)
  }

  function reset() {
    Object.assign(state, defaults())
  }

  return { ...toRefs(state), toggleRail, togglePanel, isShown, toggleRight, showView, hideView, toggleView, reset }
})
