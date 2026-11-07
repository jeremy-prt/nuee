import { defineStore } from 'pinia'
import { reactive, ref, toRefs, watch } from 'vue'

export type DockView = 'session' | 'tasks' | 'terminal' | 'changes' | 'browser' | 'files'

export const DOCK_VIEWS: DockView[] = ['session', 'tasks', 'terminal', 'changes', 'browser', 'files']


export type SessionSort = 'activity' | 'created' | 'name'

// Panneau de droite, comme l'app Claude : un ou deux volets empilés, celui du haut en premier.
interface Dock {
  open: boolean
  size: number
  panes: DockView[]
  // Hauteur du volet du haut quand il y en a deux.
  split: number
  // Dernier choix de l'utilisateur (panneau ouvert ou fermé de sa main) : sert aux sessions jamais vues.
  preferOpen: boolean
  // Panneau de chaque session, comme T3 Code : on le retrouve en revenant sur elle, même après un redémarrage.
  sessions: Record<string, { open: boolean; panes: DockView[] }>
}

const MAX_SESSIONS = 300

interface LayoutState {
  rail: { expanded: boolean; width: number }
  panel: { open: boolean; width: number }
  right: Dock
  sessionSort: SessionSort
  // Intertitres de date dans la liste des sessions : coupés par défaut, chaque session montre déjà sa date.
  sessionGroups: boolean
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
    right: { open: false, size: SIZES.right.defaultSize, panes: ['session'], split: SIZES.split.defaultSize, preferOpen: true, sessions: {} },
    sessionSort: 'activity',
    sessionGroups: false,
  }
}

function load(): LayoutState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const state: LayoutState = saved ? { ...defaults(), ...JSON.parse(saved) } : defaults()
    // Disposition d'avant les volets empilés (volet du bas, onglets) : on garde la largeur.
    if (!Array.isArray(state.right.panes)) state.right = { ...defaults().right, size: state.right.size }
    state.right = { ...defaults().right, ...state.right }
    state.right.panes = state.right.panes.filter((view) => DOCK_VIEWS.includes(view))
    if (state.right.panes.includes('session')) state.right.panes = ['session']
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
    if (!state.right.panes.length) state.right.panes = ['session']
    state.right.open = !state.right.open
    state.right.preferOpen = state.right.open
  }

  function remember(chatId: string) {
    const sessions = state.right.sessions
    delete sessions[chatId]
    sessions[chatId] = { open: state.right.open, panes: [...state.right.panes] }
    const ids = Object.keys(sessions)
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete sessions[id]
  }

  // Une session vierge démarre panneau fermé (il s'ouvre au premier message) ; une session jamais vue suit le dernier
  // choix, sur le volet Session.
  function restore(chatId: string, blank: boolean) {
    const saved = state.right.sessions[chatId]
    const dock = state.right
    if (blank) dock.open = false
    else if (saved) {
      dock.panes = saved.panes.filter((view) => DOCK_VIEWS.includes(view))
      dock.open = saved.open && dock.panes.length > 0
    } else {
      dock.panes = ['session']
      dock.open = dock.preferOpen
    }
    if (!dock.panes.length) dock.panes = ['session']
  }

  function forget(chatId: string) {
    delete state.right.sessions[chatId]
  }

  // Ouvre le volet sous celui déjà affiché ; avec deux volets, il remplace celui du bas. Session ne s'empile jamais :
  // il prend tout le panneau, et le volet ouvert ensuite le remplace.
  function showView(view: DockView) {
    const dock = state.right
    if (!dock.open || view === 'session' || dock.panes.includes('session')) dock.panes = []
    dock.open = true
    if (dock.panes.includes(view)) return
    if (dock.panes.length < 2) dock.panes.push(view)
    else dock.panes[1] = view
  }

  function hideView(view: DockView) {
    const dock = state.right
    dock.panes = dock.panes.filter((item) => item !== view)
    if (!dock.panes.length) {
      dock.open = false
      dock.preferOpen = false
    }
  }

  function toggleView(view: DockView) {
    if (isShown(view)) hideView(view)
    else showView(view)
  }

  // Fichier à déplier dans le volet Modifications (chemin absolu), hors de l'état enregistré.
  const changesFocus = ref<string | null>(null)

  function showChanges(path: string | null = null) {
    changesFocus.value = path
    showView('changes')
  }

  function reset() {
    Object.assign(state, defaults())
  }

  return {
    ...toRefs(state),
    changesFocus,
    toggleRail,
    togglePanel,
    isShown,
    toggleRight,
    remember,
    restore,
    forget,
    showView,
    showChanges,
    hideView,
    toggleView,
    reset,
  }
})
