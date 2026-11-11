// Onglets d'un éditeur de volet (fichiers de l'Explorateur, diffs du volet Git), comme monocode : un clic ouvre en
// aperçu, remplacé au clic suivant ; un double clic le garde. Un onglet ouvert s'insère après l'affiché.
export interface EditorTabs<T> {
  tabs: T[]
  open: string | null
  preview: string | null
}

export function openTab<T>(state: EditorTabs<T>, tab: T, keyOf: (tab: T) => string, pin = false) {
  const key = keyOf(tab)
  if (!state.tabs.some((item) => keyOf(item) === key)) {
    const preview = state.tabs.findIndex((item) => keyOf(item) === state.preview)
    if (!pin && preview >= 0) state.tabs.splice(preview, 1, tab)
    else state.tabs.splice(state.open ? state.tabs.findIndex((item) => keyOf(item) === state.open) + 1 : state.tabs.length, 0, tab)
    state.preview = pin ? state.preview : key
  } else if (pin && state.preview === key) state.preview = null
  state.open = key
}

export function pinTab<T>(state: EditorTabs<T>, key: string) {
  if (state.preview === key) state.preview = null
}

// Fermer l'onglet affiché montre son voisin de droite, sinon celui de gauche.
export function closeTab<T>(state: EditorTabs<T>, key: string, keyOf: (tab: T) => string) {
  const index = state.tabs.findIndex((item) => keyOf(item) === key)
  if (index < 0) return
  state.tabs.splice(index, 1)
  if (state.preview === key) state.preview = null
  const next = state.tabs[Math.min(index, state.tabs.length - 1)]
  if (state.open === key) state.open = next === undefined ? null : keyOf(next)
}
