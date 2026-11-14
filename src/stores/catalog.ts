import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { agentCatalog } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { Effort } from '@/ipc/bindings/Effort'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'

const FAVORITES_KEY = 'nuee.models.favorites.v1'
const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

function nearestEffort(efforts: Effort[], target: Effort): Effort | null {
  const distance = (effort: Effort) => Math.abs(EFFORT_ORDER.indexOf(effort) - EFFORT_ORDER.indexOf(target))
  return [...efforts].sort((a, b) => distance(a) - distance(b) || EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b))[0] ?? null
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []
  } catch {
    return []
  }
}

// Modèles et efforts que propose chaque agent installé.
export const useCatalogStore = defineStore('catalog', () => {
  const catalogs = reactive<Partial<Record<AgentKind, Catalog>>>({})
  const requested = new Set<AgentKind>()
  // Catalogues demandés sans réponse : la sonde de la CLI prend une à deux secondes au lancement.
  const waiting = reactive(new Set<AgentKind>())
  // Modèles mis en tête du sélecteur, par agent (`claude:opus`).
  const favorites = reactive(new Set<string>(loadFavorites()))
  watch(favorites, () => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])))

  const favoriteKey = (agent: AgentKind, model: string) => `${agent}:${model}`
  const isFavorite = (agent: AgentKind, model: string) => favorites.has(favoriteKey(agent, model))
  function toggleFavorite(agent: AgentKind, model: string) {
    const key = favoriteKey(agent, model)
    if (!favorites.delete(key)) favorites.add(key)
  }

  function load(agent: AgentKind) {
    if (requested.has(agent)) return
    requested.add(agent)
    waiting.add(agent)
    agentCatalog(agent)
      .then((catalog) => {
        catalogs[agent] = catalog
      })
      .catch((error) => {
        requested.delete(agent)
        console.error('catalogue', error)
      })
      .finally(() => waiting.delete(agent))
  }

  // Après une sonde : la CLI peut annoncer d'autres modèles d'un lancement à l'autre (Fable 5.1 puis 5.2).
  function reload(agent: AgentKind) {
    if (!requested.has(agent)) return
    requested.delete(agent)
    load(agent)
  }

  function get(agent: AgentKind) {
    return catalogs[agent] ?? null
  }

  const loading = (agent: AgentKind) => waiting.has(agent)

  // Modèle réellement utilisé : un modèle absent du catalogue retombe sur celui par défaut.
  function modelOf(catalog: Catalog, value: string | null) {
    const { models } = catalog
    return models.find((item) => item.value === value) ?? models.find((item) => item.value === catalog.defaultModel) ?? models[0] ?? null
  }

  // « Opus 5.5 » ; null tant que l'agent n'a pas décrit ses modèles.
  function modelLabel(agent: AgentKind, value: string | null) {
    const catalog = catalogs[agent]
    return catalog ? (modelOf(catalog, value)?.label ?? null) : null
  }

  // Réglages réellement envoyés : un effort que le modèle ne connaît pas retombe sur l'effort par défaut, ou le
  // plus proche de lui (le plus bas à égalité) ; le mode rapide tombe s'il ne l'accepte pas.
  function resolve(agent: AgentKind, options: TurnOptions): TurnOptions {
    const catalog = catalogs[agent]
    if (!catalog) return options
    const model = modelOf(catalog, options.model)
    if (!model) return { ...options, model: null, effort: null, fast: false }
    const { efforts } = model
    let effort = null
    if (options.effort && efforts.includes(options.effort)) effort = options.effort
    else effort = nearestEffort(efforts, catalog.defaultEffort)
    return { mode: options.mode, model: model.value, effort, fast: !!options.fast && model.fast }
  }

  return { load, reload, get, loading, resolve, modelLabel, isFavorite, toggleFavorite }
})
