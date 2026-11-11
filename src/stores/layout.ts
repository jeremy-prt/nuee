import { defineStore } from 'pinia'
import { reactive, ref, toRefs, watch } from 'vue'

export type DockView = 'tasks' | 'terminal' | 'changes' | 'browser' | 'files'

export const DOCK_VIEWS: DockView[] = ['browser', 'terminal', 'files', 'changes', 'tasks']


export type SessionSort = 'activity' | 'created' | 'name'

// Panneau de droite en onglets, comme T3 Code : les volets ouverts en onglets ; `null` montre le lanceur « Ouvrir un
// volet ». Environnement n'en fait pas partie, c'est un panneau flottant (`ShellEnvironment`).
interface Dock {
  open: boolean
  // Largeur affichée, celle que tire la poignée. Elle vient de `width`, ou d'`editorWidth` tant qu'un fichier est ouvert
  // dans l'Explorateur ; null : jamais réglée, la valeur par défaut de l'app s'applique (comme T3 Code).
  size: number
  width: number | null
  editorWidth: number | null
  tabs: DockView[]
  active: DockView | null
  // Second volet affiché à côté de `active` (panneau partagé en deux zones), et la part qu'il occupe.
  aside: DockView | null
  asideRatio: number
  // Dernier choix de l'utilisateur (panneau ouvert ou fermé de sa main) : sert aux sessions jamais vues.
  preferOpen: boolean
  // Onglets de chaque session, comme T3 Code : on les retrouve en revenant sur elle, même après un redémarrage.
  sessions: Record<string, { open: boolean; tabs: DockView[]; active?: DockView | null; aside?: DockView | null }>
}

// Panneau partagé : côte à côte dès cette largeur, empilé en dessous (le panneau fait 360 px par défaut).
export const SIDE_BY_SIDE = 640
// Taille minimale de chaque zone du panneau partagé.
export const ZONE_MIN = 160

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
  right: { min: 280, max: 800, defaultSize: 360 },
}

// Ancienne largeur par défaut, enregistrée telle quelle avant `width` : elle repasse à la nouvelle.
const OLD_RIGHT_DEFAULT = 420

function rightWidth(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(SIZES.right.max, Math.max(SIZES.right.min, Math.round(value))) : null
}

// Sans doublon ni volet inconnu (l'ancien `session` d'une disposition enregistrée disparaît ici).
function tabsOf(views: readonly DockView[]): DockView[] {
  return [...new Set(views.filter((view) => DOCK_VIEWS.includes(view)))]
}

function validActive(view: DockView | null | undefined, tabs: readonly DockView[]): DockView | null {
  return view && tabs.includes(view) ? view : null
}

function validAside(view: DockView | null | undefined, tabs: readonly DockView[], active: DockView | null): DockView | null {
  return active && view !== active ? validActive(view, tabs) : null
}

function defaults(): LayoutState {
  return {
    rail: { expanded: true, width: SIZES.rail.defaultSize },
    panel: { open: true, width: SIZES.panel.defaultSize },
    right: { open: false, size: SIZES.right.defaultSize, width: null, editorWidth: null, tabs: [], active: null, aside: null, asideRatio: 0.5, preferOpen: true, sessions: {} },
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
    if (!Array.isArray(old.tabs)) state.right.tabs = Array.isArray(old.panes) ? old.panes : []
    state.right.tabs = tabsOf(state.right.tabs)
    state.right.active = validActive(state.right.active, state.right.tabs)
    state.right.aside = validAside(state.right.aside, state.right.tabs, state.right.active)
    for (const [id, saved] of Object.entries(state.right.sessions)) {
      const legacy = saved as { open: boolean; tabs?: DockView[]; panes?: DockView[]; active?: DockView | null; aside?: DockView | null }
      const tabs = tabsOf(legacy.tabs ?? legacy.panes ?? [])
      const active = validActive(legacy.active, tabs)
      state.right.sessions[id] = { open: !!legacy.open, tabs, active, aside: validAside(legacy.aside, tabs, active) }
    }
    delete (state.right as { panes?: unknown }).panes
    delete (state.right as { split?: unknown }).split
    const legacy = state as LayoutState & { bottom?: unknown; views?: unknown }
    delete legacy.bottom
    delete legacy.views
    if (!('width' in old)) state.right.width = old.size === OLD_RIGHT_DEFAULT ? null : rightWidth(old.size)
    state.right.width = rightWidth(state.right.width)
    state.right.editorWidth = rightWidth(state.right.editorWidth)
    state.right.size = state.right.width ?? SIZES.right.defaultSize
    // Une largeur enregistrée avant un changement de minimum reste dans les bornes actuelles.
    state.rail.width = Math.min(SIZES.rail.max, Math.max(SIZES.rail.min, state.rail.width))
    return state
  } catch {
    return defaults()
  }
}

export const useLayoutStore = defineStore('layout', () => {
  const state = reactive(load())

  // Regroupé : pendant un redimensionnement, chaque mouvement de souris réécrivait tout le JSON.
  let timer = 0
  watch(
    state,
    (value) => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        } catch {
          // Stockage indisponible : la disposition reste valable pour la session.
        }
      }, 300)
    },
    { deep: true },
  )

  // Fichier ouvert dans l'Explorateur (signalé par `FilesPanel`) : le panneau prend la largeur retenue pour ce cas, sans
  // toucher à celle du panneau simple. Jamais réglée : `roomy`, calculée par `FilesPanel`, non retenue.
  const editing = ref(false)
  let switching = false
  function setEditing(value: boolean, roomy = 0) {
    if (editing.value === value) return
    editing.value = value
    const simple = state.right.width ?? SIZES.right.defaultSize
    switching = true
    state.right.size = value ? (state.right.editorWidth ?? Math.min(SIZES.right.max, Math.max(simple, Math.round(roomy)))) : simple
    switching = false
  }
  watch(
    () => state.right.size,
    (size) => {
      if (switching) return
      if (editing.value) state.right.editorWidth = size
      else state.right.width = size
    },
    { flush: 'sync' },
  )

  function toggleRail() {
    state.rail.expanded = !state.rail.expanded
  }

  function togglePanel() {
    state.panel.open = !state.panel.open
  }

  function isShown(view: DockView) {
    return state.right.open && (state.right.active === view || (!!state.right.active && state.right.aside === view))
  }

  // Volet de la première zone, sur toute la largeur du panneau : la barre de titre peut s'aligner sur ses colonnes.
  function spans(view: DockView) {
    const dock = state.right
    return dock.open && dock.active === view && !(dock.aside && dock.size >= SIDE_BY_SIDE)
  }

  // Un onglet ajouté par l'agent laisse `active` à null : le panneau s'ouvre sur lui plutôt que sur le lanceur.
  function toggleRight() {
    const dock = state.right
    dock.open = !dock.open
    dock.active ??= dock.tabs[0] ?? null
    dock.preferOpen = dock.open
  }

  function remember(chatId: string) {
    const sessions = state.right.sessions
    delete sessions[chatId]
    sessions[chatId] = { open: state.right.open, tabs: [...state.right.tabs], active: state.right.active, aside: state.right.aside }
    const ids = Object.keys(sessions)
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete sessions[id]
  }

  // Une conversation retrouve ses volets et celui qu'elle montrait, sinon le premier. Jamais vue, elle ne s'ouvre
  // d'office que si elle a un onglet à montrer, jamais sur un lanceur vide. Une vierge qui a déjà son état (celle de ⌘D
  // en hérite) le garde.
  function restore(chatId: string, blank: boolean) {
    const saved = state.right.sessions[chatId]
    const dock = state.right
    dock.tabs = tabsOf(saved?.tabs ?? [])
    dock.active = validActive(saved?.active, dock.tabs) ?? dock.tabs[0] ?? null
    dock.aside = validAside(saved?.aside, dock.tabs, dock.active)
    dock.open = saved ? saved.open : !blank && dock.preferOpen && dock.tabs.length > 0
  }

  function forget(chatId: string) {
    delete state.right.sessions[chatId]
  }

  // Un volet déjà affiché à côté y reste.
  function showView(view: DockView) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    if (dock.aside === view && dock.active) {
      dock.open = true
      return
    }
    if (dock.aside === view) dock.aside = null
    dock.active = view
    dock.open = true
  }

  // « Ouvrir à côté » : le panneau se partage entre le volet affiché et celui-ci.
  function showAside(view: DockView) {
    const dock = state.right
    if (!dock.active || dock.active === view) return
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    dock.aside = view
    dock.open = true
  }

  function closeAside() {
    state.right.aside = null
  }

  // Onglet ajouté sans être montré ni ouvrir le panneau (l'agent s'est servi du volet).
  function addTab(view: DockView) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
  }

  // Même chose pour une session qui n'est pas à l'écran : on le retrouve en revenant sur elle.
  function addView(chatId: string, view: DockView) {
    const saved = state.right.sessions[chatId] ?? { open: false, tabs: [] as DockView[], active: null }
    state.right.sessions[chatId] = { ...saved, tabs: tabsOf([...saved.tabs, view]) }
  }

  // Le dernier volet fermé laisse le lanceur. Panneau partagé : la zone qui reste prend toute la place.
  function closeView(view: DockView) {
    const dock = state.right
    const index = dock.tabs.indexOf(view)
    if (index === -1) return
    dock.tabs.splice(index, 1)
    if (dock.aside === view) dock.aside = null
    if (dock.active !== view) return
    dock.active = dock.aside ?? dock.tabs[index] ?? dock.tabs[index - 1] ?? null
    dock.aside = null
  }

  // « + » : le lanceur, sans fermer de volet.
  function showLauncher() {
    state.right.active = null
    state.right.open = true
  }

  // Raccourci d'un volet : l'affiche ; déjà affiché, ne ferme que sa zone, ou le panneau s'il est seul.
  function toggleView(view: DockView) {
    const dock = state.right
    if (!isShown(view)) showView(view)
    else if (dock.aside === view) dock.aside = null
    else if (dock.aside) {
      dock.active = dock.aside
      dock.aside = null
    } else dock.open = false
    dock.preferOpen = dock.open
  }

  // Fichier à déplier dans le volet Modifications (chemin absolu), hors de l'état enregistré.
  const changesFocus = ref<string | null>(null)

  function showChanges(path: string | null = null) {
    changesFocus.value = path
    showView('changes')
  }

  function reset() {
    switching = true
    Object.assign(state, defaults())
    switching = false
  }

  return {
    ...toRefs(state),
    changesFocus,
    setEditing,
    spans,
    toggleRail,
    togglePanel,
    isShown,
    toggleRight,
    remember,
    restore,
    forget,
    showView,
    showAside,
    closeAside,
    showLauncher,
    addTab,
    addView,
    showChanges,
    closeView,
    toggleView,
    reset,
  }
})
