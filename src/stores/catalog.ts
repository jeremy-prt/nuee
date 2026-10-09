import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { agentCatalog } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'

// Modèles et efforts que propose chaque agent installé.
export const useCatalogStore = defineStore('catalog', () => {
  const catalogs = reactive<Partial<Record<AgentKind, Catalog>>>({})
  const requested = new Set<AgentKind>()

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

  // Réglages réellement envoyés : un modèle absent du catalogue retombe sur celui par défaut,
  // un effort que le modèle ne connaît pas sur l'effort par défaut.
  function resolve(agent: AgentKind, options: TurnOptions): TurnOptions {
    const catalog = catalogs[agent]
    if (!catalog) return options
    const models = catalog.models
    const model =
      models.find((item) => item.value === options.model) ??
      models.find((item) => item.value === catalog.defaultModel) ??
      models[0]
    if (!model) return { ...options, model: null, effort: null }
    const { efforts } = model
    let effort = null
    if (options.effort && efforts.includes(options.effort)) effort = options.effort
    else if (efforts.includes(catalog.defaultEffort)) effort = catalog.defaultEffort
    else effort = efforts.at(-1) ?? null
    return { mode: options.mode, model: model.value, effort }
  }

  return { load, get, resolve }
})
