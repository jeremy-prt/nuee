import { defineStore } from 'pinia'
import { reactive, ref, toRefs, watch } from 'vue'

export type DockView = 'session' | 'tasks' | 'terminal' | 'changes' | 'browser' | 'files'

export const DOCK_VIEWS: DockView[] = ['session', 'tasks', 'terminal', 'changes', 'browser', 'files']


export type SessionSort = 'activity' | 'created' | 'name'

// Panneau de droite en onglets, comme Devin : Session (Environnement) toujours en premier, les volets ouverts ensuite,
// un seul visible.
interface Dock {
  open: boolean
  size: number
  tabs: DockView[]
  active: DockView
  // Dernier choix de l'utilisateur (panneau ouvert ou fermé de sa main) : sert aux sessions jamais vues.
  preferOpen: boolean
  // Onglets de chaque session, comme T3 Code : on les retrouve en revenant sur elle, même après un redémarrage.
  sessions: Record<string, { open: boolean; tabs: DockView[] }>
}

const MAX_SESSIONS = 300

interface LayoutState {
  rail: { expanded: boolean; width: number }
  panel: { open: boolean; width: number }
  right: Dock
  sessionSort: SessionSort
  // Intertitres de date dans la liste des sessions : coupés par défaut, chaque session montre déjà sa date.
  sessionGroups: boolean
  // Une ligne par session (titre, état ou heure), comme OpenCode.
  sessionCompact: boolean
  // Ordre des épinglées, choisi en les glissant ; une épinglée absente se range après, selon le tri.
  pinnedOrder: string[]
  // Onglets épinglés : en tête de la bande dans tous les projets, gardés au redémarrage (choix de Jérémy).
  pinnedTabs: string[]
}

const STORAGE_KEY = 'nuee.layout.v5'

export const RAIL_COLLAPSED_WIDTH = 48

export const SIZES = {
  // Même largeur dans les deux dispositions : en « Projets en menu », la barre porte aussi les sessions.
  rail: { min: 180, max: 420, defaultSize: 240 },
  panel: { min: 200, max: 420, defaultSize: 240 },
  right: { min: 280, max: 800, defaultSize: 420 },
}

// Session en premier, sans doublon ni volet inconnu.
function tabsOf(views: readonly DockView[]): DockView[] {
  return ['session', ...new Set(views.filter((view) => DOCK_VIEWS.includes(view) && view !== 'session'))]
}

function defaults(): LayoutState {
  return {
    rail: { expanded: true, width: SIZES.rail.defaultSize },
    panel: { open: true, width: SIZES.panel.defaultSize },
    right: { open: false, size: SIZES.right.defaultSize, tabs: ['session'], active: 'session', preferOpen: true, sessions: {} },
    sessionSort: 'activity',
    sessionGroups: false,
    sessionCompact: true,
    pinnedOrder: [],
    pinnedTabs: [],
  }
}

function load(): LayoutState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const state: LayoutState = saved ? { ...defaults(), ...JSON.parse(saved) } : defaults()
    // Disposition d'avant les onglets (volets empilés) : ses volets deviennent des onglets.
    const old = state.right as Partial<Dock> & { panes?: DockView[]; split?: number }
    state.right = { ...defaults().right, ...old }
    if (!Array.isArray(old.tabs)) state.right.tabs = Array.isArray(old.panes) ? old.panes : ['session']
    state.right.tabs = tabsOf(state.right.tabs)
    if (!state.right.tabs.includes(state.right.active)) state.right.active = 'session'
    for (const [id, saved] of Object.entries(state.right.sessions)) {
      const legacy = saved as { open: boolean; tabs?: DockView[]; panes?: DockView[] }
      state.right.sessions[id] = { open: !!legacy.open, tabs: tabsOf(legacy.tabs ?? legacy.panes ?? []) }
    }
    delete (state.right as { panes?: unknown }).panes
    delete (state.right as { split?: unknown }).split
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
    return state.right.open && state.right.active === view
  }

  function toggleRight() {
    state.right.open = !state.right.open
    state.right.preferOpen = state.right.open
  }

  function remember(chatId: string) {
    const sessions = state.right.sessions
    delete sessions[chatId]
    sessions[chatId] = { open: state.right.open, tabs: [...state.right.tabs] }
    const ids = Object.keys(sessions)
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete sessions[id]
  }

  // Une conversation s'ouvre toujours sur Environnement (choix de Jérémy), ses autres onglets à côté. Vierge, le
  // panneau est fermé (il s'ouvre au premier message) ; jamais vue, elle suit le dernier choix.
  function restore(chatId: string, blank: boolean) {
    const saved = state.right.sessions[chatId]
    const dock = state.right
    dock.tabs = tabsOf(saved?.tabs ?? [])
    dock.active = 'session'
    dock.open = blank ? false : saved ? saved.open : dock.preferOpen
  }

  function forget(chatId: string) {
    delete state.right.sessions[chatId]
  }

  function showView(view: DockView) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    dock.active = view
    dock.open = true
  }

  // Session reste : c'est l'onglet de départ du panneau.
  function closeView(view: DockView) {
    const dock = state.right
    const index = dock.tabs.indexOf(view)
    if (view === 'session' || index === -1) return
    dock.tabs.splice(index, 1)
    if (dock.active === view) dock.active = dock.tabs[index] ?? dock.tabs[index - 1] ?? 'session'
  }

  // ⌘J pour le terminal : l'affiche, ou referme le panneau s'il est déjà devant.
  function toggleView(view: DockView) {
    if (isShown(view)) state.right.open = false
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
    closeView,
    toggleView,
    reset,
  }
})
