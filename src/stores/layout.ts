import { defineStore } from 'pinia'
import { reactive, ref, toRefs, watch } from 'vue'

export type DockView = 'tasks' | 'terminal' | 'changes' | 'browser' | 'files'

export const DOCK_VIEWS: DockView[] = ['browser', 'terminal', 'files', 'changes', 'tasks']


export type SessionSort = 'activity' | 'created' | 'name'
export type SessionGroups = 'none' | 'date' | 'status'

// Mode du volet Git : changements non commités ou journal de la branche.
export type GitMode = 'changes' | 'history'

// Volets qui ouvrent un éditeur à gauche de leur liste.
export type EditorView = Extract<DockView, 'files' | 'changes'>

export type SlideColumn = 'rail' | 'panel' | 'dock'

// Zone du panneau partagé : la première (en haut ou à gauche, `active`) ou la seconde (`aside`).
export type DockZone = 'start' | 'end'

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
  // Dernier choix de l'utilisateur (panneau ouvert ou fermé de sa main) : sert aux projets jamais vus.
  preferOpen: boolean
  // Onglets et panneau ouvert ou fermé de chaque session, comme T3 Code : on les retrouve en revenant sur elle, même
  // après un redémarrage. `active` et `aside` n'y restent que dans une disposition d'avant `projects`, lue par `adopt`.
  sessions: Record<string, SessionDock>
  // Volets affichés, communs aux sessions d'un projet ('' : « Sans projet »). `open` n'y sert qu'à une session jamais vue.
  projects: Record<string, ProjectDock>
  // Mode du volet Git par projet, comme le reste de la disposition.
  gitModes: Record<string, GitMode>
}

interface SessionDock {
  tabs: DockView[]
  open?: boolean
  active?: DockView | null
  aside?: DockView | null
}

interface ProjectDock {
  open: boolean
  active: DockView | null
  aside: DockView | null
  asideRatio: number
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
  // Intertitres de la liste des sessions : coupés par défaut, chaque session montre déjà sa date et son état.
  sessionGroups: SessionGroups
  // Intertitres repliés (`status.idle`, `week`…) : les sessions au repos le sont d'emblée, comme le « Settled » de T3 Code.
  collapsedGroups: string[]
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
  rail: { min: 180, max: 420, defaultSize: 264 },
  panel: { min: 200, max: 420, defaultSize: 264 },
  right: { min: 280, max: 800, defaultSize: 480 },
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
    right: { open: false, size: SIZES.right.defaultSize, width: null, editorWidth: null, tabs: [], active: null, aside: null, asideRatio: 0.5, preferOpen: true, sessions: {}, projects: {}, gitModes: {} },
    sessionSort: 'activity',
    sessionGroups: 'none',
    collapsedGroups: ['status.idle'],
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
      const legacy = saved as SessionDock & { panes?: DockView[] }
      const tabs = tabsOf(legacy.tabs ?? legacy.panes ?? [])
      if (!('active' in legacy)) {
        state.right.sessions[id] = typeof legacy.open === 'boolean' ? { tabs, open: legacy.open } : { tabs }
        continue
      }
      const active = validActive(legacy.active, tabs)
      state.right.sessions[id] = { open: !!legacy.open, tabs, active, aside: validAside(legacy.aside, tabs, active) }
    }
    for (const [group, saved] of Object.entries(state.right.projects)) {
      const active = DOCK_VIEWS.includes(saved.active!) ? saved.active : null
      const aside = active && saved.aside !== active && DOCK_VIEWS.includes(saved.aside!) ? saved.aside : null
      const ratio = Number.isFinite(saved.asideRatio) ? Math.min(0.9, Math.max(0.1, saved.asideRatio)) : 0.5
      state.right.projects[group] = { open: !!saved.open, active, aside, asideRatio: ratio }
    }
    state.right.gitModes = Object.fromEntries(
      Object.entries(state.right.gitModes ?? {}).filter(([, mode]) => mode === 'changes' || mode === 'history'),
    )
    delete (state.right as { panes?: unknown }).panes
    delete (state.right as { split?: unknown }).split
    // Ancien interrupteur « Regrouper par date ».
    const groups = state.sessionGroups as unknown
    state.sessionGroups = groups === true ? 'date' : groups === 'date' || groups === 'status' ? groups : 'none'
    if (!Array.isArray(state.collapsedGroups)) state.collapsedGroups = defaults().collapsedGroups
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

  // Éditeur ouvert à gauche d'un volet (fichier de l'Explorateur, diff du volet Git, signalé par `useDockEditor`) : le
  // panneau prend la largeur retenue pour ce cas, sans toucher à celle du panneau simple. Jamais réglée : `roomy`, non
  // retenue.
  const editors = reactive(new Set<EditorView>())
  let switching = false
  function setEditing(view: EditorView, value: boolean, roomy = 0) {
    const was = editors.size > 0
    if (value) editors.add(view)
    else editors.delete(view)
    const editing = editors.size > 0
    if (was === editing) return
    const simple = state.right.width ?? SIZES.right.defaultSize
    switching = true
    state.right.size = editing ? (state.right.editorWidth ?? Math.min(SIZES.right.max, Math.max(simple, Math.round(roomy)))) : simple
    switching = false
  }
  function editingIn(view: EditorView) {
    return editors.has(view)
  }
  watch(
    () => state.right.size,
    (size) => {
      if (switching) return
      if (editors.size) state.right.editorWidth = size
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

  // Zone qui a le focus dans le panneau partagé, comme le groupe actif de VS Code : un volet choisi s'y affiche.
  const zone = ref<DockZone>('start')
  watch(
    () => state.right.aside,
    (aside) => {
      if (!aside) zone.value = 'start'
    },
  )

  // Session affichée et son projet : `remember` range ses onglets et l'ouverture sous elle, la disposition sous le projet.
  let viewing: { chatId: string; group: string } | null = null

  // Seulement la session que `restore` a montrée : un enregistrement passé avant lui rangerait l'état de la précédente.
  function remember(chatId: string) {
    if (viewing?.chatId !== chatId) return
    const dock = state.right
    const sessions = dock.sessions
    delete sessions[chatId]
    sessions[chatId] = { tabs: [...dock.tabs], open: dock.open }
    const ids = Object.keys(sessions)
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete sessions[id]
    dock.projects[viewing.group] = { open: dock.open, active: dock.active, aside: dock.aside, asideRatio: dock.asideRatio }
  }

  // Projet jamais vu depuis la disposition par projet : celle de sa dernière session vue (enregistrée par session
  // avant), sinon fermé, ou ouvert sur le premier onglet de la session si l'utilisateur laisse le panneau ouvert.
  function adopt(group: string, members: readonly string[], tabs: readonly DockView[]): ProjectDock {
    const dock = state.right
    const ids = new Set(members)
    const seen = Object.entries(dock.sessions).filter(([id, saved]) => ids.has(id) && 'active' in saved)
    const last = seen.at(-1)?.[1]
    let layout: ProjectDock
    if (last) {
      const active = validActive(last.active, last.tabs) ?? last.tabs[0] ?? null
      layout = { open: !!last.open, active, aside: validAside(last.aside, last.tabs, active), asideRatio: dock.asideRatio }
    } else {
      layout = { open: dock.preferOpen && tabs.length > 0, active: tabs[0] ?? null, aside: null, asideRatio: dock.asideRatio }
    }
    for (const [id, saved] of seen) dock.sessions[id] = { tabs: saved.tabs, open: !!saved.open }
    dock.projects[group] = layout
    return layout
  }

  // La session montre la disposition de son projet avec son propre contenu. Un volet du projet qu'elle n'a pas encore
  // devient un de ses onglets, vide : rien n'est copié d'une session à l'autre. Ouvert ou fermé : celui de la session,
  // celui du projet si elle n'a jamais été vue, toujours fermé pour une vierge (demande de Jérémy).
  function restore(chatId: string, projectId: string | null, members: readonly string[], blank = false) {
    const dock = state.right
    const group = projectId ?? ''
    const saved = dock.sessions[chatId]
    const tabs = tabsOf(saved?.tabs ?? [])
    const layout = dock.projects[group] ?? adopt(group, members, tabs)
    for (const view of [layout.active, layout.aside]) if (view && !tabs.includes(view)) tabs.push(view)
    viewing = { chatId, group }
    dock.tabs = tabs
    dock.active = layout.active
    dock.aside = validAside(layout.aside, tabs, layout.active)
    dock.asideRatio = layout.asideRatio
    dock.open = !blank && (saved?.open ?? layout.open)
    zone.value = 'start'
  }

  function forget(chatId: string) {
    delete state.right.sessions[chatId]
  }

  function zoneOf(view: DockView): DockZone | null {
    const dock = state.right
    if (!dock.active) return null
    return dock.active === view ? 'start' : dock.aside === view ? 'end' : null
  }

  // Un volet déjà affiché garde sa zone ; un autre prend celle qui a le focus.
  function showView(view: DockView) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    dock.open = true
    const shownIn = zoneOf(view)
    if (shownIn) {
      zone.value = shownIn
      return
    }
    if (dock.aside === view) dock.aside = null
    if (dock.active && dock.aside && zone.value === 'end') dock.aside = view
    else dock.active = view
  }

  // Volet déposé dans une zone (glisser-déposer). Il remplace celui qui y était ; venu de l'autre zone, les deux
  // s'échangent et la poignée reste où elle était.
  function placeView(view: DockView, at: DockZone) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    dock.open = true
    if (!dock.active) {
      if (dock.aside === view) dock.aside = null
      dock.active = view
      return
    }
    const from = zoneOf(view)
    if (from === at || (!dock.aside && from)) return
    const replaced = at === 'start' ? dock.active : dock.aside
    const kept = at === 'start' ? (dock.aside ?? dock.active) : dock.active
    const other = kept === view ? replaced! : kept
    if (from) dock.asideRatio = 1 - dock.asideRatio
    dock.active = at === 'start' ? view : other
    dock.aside = at === 'start' ? other : view
    zone.value = at
  }

  // « Ouvrir à côté » : le panneau se partage entre le volet affiché et celui-ci.
  function showAside(view: DockView) {
    const dock = state.right
    if (!dock.active || dock.active === view) return
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
    dock.aside = view
    dock.open = true
    zone.value = 'end'
  }

  // Croix d'une zone : elle disparaît, l'autre prend toute la place ; son volet reste ouvert en onglet.
  function closeZone(at: DockZone) {
    const dock = state.right
    if (!dock.aside) return
    if (at === 'start') dock.active = dock.aside
    dock.aside = null
  }

  // Onglet ajouté sans être montré ni ouvrir le panneau (l'agent s'est servi du volet).
  function addTab(view: DockView) {
    const dock = state.right
    if (!dock.tabs.includes(view)) dock.tabs.push(view)
  }

  // Même chose pour une session qui n'est pas à l'écran : on le retrouve en revenant sur elle, la disposition ne
  // bouge pas.
  function addView(chatId: string, view: DockView) {
    const saved = state.right.sessions[chatId] ?? { tabs: [] }
    state.right.sessions[chatId] = { ...saved, tabs: tabsOf([...saved.tabs, view]) }
  }

  // Le volet fermé laisse le lanceur, pas son voisin (choix de Jérémy). Panneau partagé : la zone qui reste prend toute
  // la place.
  function closeView(view: DockView) {
    const dock = state.right
    const index = dock.tabs.indexOf(view)
    if (index === -1) return
    dock.tabs.splice(index, 1)
    if (dock.aside === view) dock.aside = null
    if (dock.active !== view) return
    dock.active = dock.aside ?? null
    dock.aside = null
  }

  // Onglet affiché recliqué : le lanceur, sans fermer de volet.
  function showLauncher() {
    state.right.active = null
    state.right.open = true
  }

  // Raccourci d'un volet : l'affiche ; déjà affiché, ne ferme que sa zone, ou le panneau s'il est seul.
  function toggleView(view: DockView) {
    const dock = state.right
    if (!isShown(view)) showView(view)
    else if (dock.aside) closeZone(zoneOf(view)!)
    else dock.open = false
    dock.preferOpen = dock.open
  }

  // Colonne qui glisse (`useColumnSlide`) : celle qui se ferme reste affichée jusqu'à la fin du mouvement.
  const moving = reactive<Record<SlideColumn, boolean>>({ rail: false, panel: false, dock: false })

  // Fichier à montrer dans le volet Git (chemin absolu), hors de l'état enregistré.
  const changesFocus = ref<string | null>(null)
  // Volet Git affiché par son raccourci : le focus va à sa première ligne une fois la liste lue.
  const changesWantsFocus = ref(false)

  function showChanges(path: string | null = null) {
    changesFocus.value = path
    showView('changes')
  }

  function gitMode(projectId: string | null): GitMode {
    return state.right.gitModes[projectId ?? ''] ?? 'changes'
  }

  function setGitMode(projectId: string | null, mode: GitMode) {
    state.right.gitModes[projectId ?? ''] = mode
  }

  function reset() {
    switching = true
    Object.assign(state, defaults())
    switching = false
  }

  return {
    ...toRefs(state),
    moving,
    changesFocus,
    changesWantsFocus,
    setEditing,
    editingIn,
    spans,
    toggleRail,
    togglePanel,
    isShown,
    toggleRight,
    remember,
    restore,
    forget,
    showView,
    zone,
    zoneOf,
    placeView,
    showAside,
    closeZone,
    showLauncher,
    addTab,
    addView,
    showChanges,
    gitMode,
    setGitMode,
    closeView,
    toggleView,
    reset,
  }
})
