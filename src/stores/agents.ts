import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import { useToastsStore } from '@/stores/toasts'
import { agents } from '@/utils/agents'

interface AgentSettings {
  enabled: boolean
  // null : détection automatique. Sinon l'emplacement choisi à la main.
  path: string | null
  // Réglages de départ d'un nouveau chat ; null laisse l'agent choisir.
  defaults: TurnOptions
}

export interface AgentStatus {
  state: 'checking' | 'found' | 'missing'
  path: string | null
  version: string | null
  latest: string | null
  // Compte connecté à la CLI (son e-mail), null si personne n'est connecté.
  account: string | null
  // Part des quotas consommée (0 à 1) et date de remise à zéro, null si l'abonnement n'en a pas.
  usage: { session: Quota; weekly: Quota } | null
  updating: boolean
}

export interface Quota {
  used: number
  resetsAt: number
}

const STORAGE_KEY = 'nuee.agents.v1'
const MODES: PermissionMode[] = ['bypass', 'auto']
const kinds = Object.keys(agents) as AgentKind[]

function defaults(): AgentSettings {
  return { enabled: true, path: null, defaults: { mode: 'bypass', model: null, effort: null } }
}

function load() {
  const settings = Object.fromEntries(kinds.map((kind) => [kind, defaults()])) as Record<AgentKind, AgentSettings>
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    for (const kind of kinds) {
      const value = saved[kind]
      if (!value) continue
      if (typeof value.enabled === 'boolean') settings[kind].enabled = value.enabled
      if (typeof value.path === 'string') settings[kind].path = value.path
      if (MODES.includes(value.defaults?.mode)) settings[kind].defaults.mode = value.defaults.mode
      if (typeof value.defaults?.model === 'string') settings[kind].defaults.model = value.defaults.model
      if (typeof value.defaults?.effort === 'string') settings[kind].defaults.effort = value.defaults.effort
    }
  } catch {
    // Réglages illisibles : on repart des valeurs par défaut.
  }
  return settings
}

// Maquette en attendant la commande Rust `agent_probe` (emplacement trouvé, version installée, dernière
// version publiée, compte connecté) et la mise à jour de la CLI : seules ces deux fonctions simulent.
function probe(path: string | null) {
  const hour = 3_600_000
  const monday = new Date()
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7))
  monday.setHours(9, 0, 0, 0)
  return new Promise<Pick<AgentStatus, 'path' | 'version' | 'latest' | 'account' | 'usage'>>((resolve) =>
    setTimeout(
      () =>
        resolve({
          path: path ?? '/opt/homebrew/bin/claude',
          version: '2.1.4',
          latest: '2.1.7',
          account: 'toi@exemple.com',
          usage: { session: { used: 0.42, resetsAt: Date.now() + 2.2 * hour }, weekly: { used: 0.18, resetsAt: monday.getTime() } },
        }),
      600,
    ),
  )
}

function install(version: string) {
  return new Promise<string>((resolve) => setTimeout(() => resolve(version), 1500))
}

// Agents de Réglages > Agents : activés ou non, emplacement de leur CLI, réglages de départ des chats.
// La détection part au lancement de l'app.
export const useAgentsStore = defineStore('agents', () => {
  const settings = reactive(load())
  const status = reactive(
    Object.fromEntries(
      kinds.map((kind) => [kind, { state: 'checking', path: null, version: null, latest: null, account: null, usage: null, updating: false }]),
    ) as Record<AgentKind, AgentStatus>,
  )

  watch(
    settings,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch {
        // Stockage indisponible : les réglages restent valables pour la session.
      }
    },
    { deep: true },
  )

  async function detect(kind: AgentKind) {
    const current = status[kind]
    current.state = 'checking'
    try {
      Object.assign(current, await probe(settings[kind].path), { state: 'found' })
    } catch {
      Object.assign(current, { state: 'missing', path: null, version: null, latest: null, account: null, usage: null })
    }
  }

  async function update(kind: AgentKind) {
    const current = status[kind]
    if (!current.latest || current.updating) return
    current.updating = true
    try {
      current.version = await install(current.latest)
      current.latest = null
      const { t } = i18nGlobal()
      useToastsStore().push({
        title: t('settings.agents.updatedTitle', { agent: agents[kind].name }),
        body: t('settings.agents.updatedBody', { version: current.version }),
      })
    } finally {
      current.updating = false
    }
  }

  function setPath(kind: AgentKind, path: string | null) {
    settings[kind].path = path
    detect(kind)
  }

  function chatDefaults(kind: AgentKind): TurnOptions {
    return { ...settings[kind].defaults }
  }

  for (const kind of kinds) detect(kind)

  return { settings, status, detect, update, setPath, chatDefaults }
})
