import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { agentCatalog } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'

const FAVORITES_KEY = 'nuee.models.favorites.v1'

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
    agentCatalog(agent)
      .then((catalog) => {
        catalogs[agent] = catalog
      })
      .catch((error) => {
        requested.delete(agent)
        console.error('catalogue', error)
      })
  }

  function get(agent: AgentKind) {
    return catalogs[agent] ?? null
  }

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

  // Réglages réellement envoyés : un effort que le modèle ne connaît pas retombe sur l'effort par défaut, le mode
  // rapide tombe s'il ne l'accepte pas.
  function resolve(agent: AgentKind, options: TurnOptions): TurnOptions {
    const catalog = catalogs[agent]
    if (!catalog) return options
    const model = modelOf(catalog, options.model)
    if (!model) return { ...options, model: null, effort: null, fast: false }
    const { efforts } = model
    let effort = null
    if (options.effort && efforts.includes(options.effort)) effort = options.effort
    else if (efforts.includes(catalog.defaultEffort)) effort = catalog.defaultEffort
    else effort = efforts.at(-1) ?? null
    return { mode: options.mode, model: model.value, effort, fast: !!options.fast && model.fast }
  }

  return { load, get, resolve, modelLabel, isFavorite, toggleFavorite }
})
