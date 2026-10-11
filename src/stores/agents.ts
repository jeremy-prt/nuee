import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { agentProbe, agentUpdate, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AgentStatus as Probed } from '@/ipc/bindings/AgentStatus'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { TurnStatus } from '@/ipc/bindings/TurnStatus'
import { useToastsStore } from '@/stores/toasts'
import { agents } from '@/utils/agents'

interface AgentSettings {
  enabled: boolean
  // null : détection automatique. Sinon l'emplacement choisi à la main.
  path: string | null
  // Réglages de départ d'un nouveau chat ; null laisse l'agent choisir.
  defaults: TurnOptions
  // false : les hooks de la config de l'agent ne tournent pas dans les chats de Nuée.
  hooks: boolean
}

// Ce que Rust renvoie, plus l'état de la détection : introuvable, ou trouvé mais muet.
export interface AgentStatus extends Omit<Probed, 'path'> {
  state: 'checking' | 'found' | 'missing' | 'error'
  path: string | null
  updating: boolean
}

const STORAGE_KEY = 'nuee.agents.v1'
const BLANK = { path: null, version: null, latest: null, account: null, usage: null }
const MODES: PermissionMode[] = ['bypass', 'auto']
const kinds = Object.keys(agents) as AgentKind[]

function defaults(): AgentSettings {
  return { enabled: true, path: null, defaults: { mode: 'bypass', model: null, effort: null }, hooks: true }
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
      if (typeof value.hooks === 'boolean') settings[kind].hooks = value.hooks
      if (MODES.includes(value.defaults?.mode)) settings[kind].defaults.mode = value.defaults.mode
      if (typeof value.defaults?.model === 'string') settings[kind].defaults.model = value.defaults.model
      if (typeof value.defaults?.effort === 'string') settings[kind].defaults.effort = value.defaults.effort
    }
  } catch {
    // Réglages illisibles : on repart des valeurs par défaut.
  }
  return settings
}

// Agents de Réglages > Agents : activés ou non, emplacement de leur CLI, réglages de départ des chats.
// La détection part au lancement de l'app.
export const useAgentsStore = defineStore('agents', () => {
  const settings = reactive(load())
  const status = reactive(
    Object.fromEntries(
      kinds.map((kind) => [kind, { state: 'checking', ...BLANK, updating: false }]),
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

  // La dernière détection lancée l'emporte : une réponse plus ancienne (autre chemin) est ignorée.
  const runs: Partial<Record<AgentKind, number>> = {}

  // quiet : rafraîchir (quotas) sans repasser par « Recherche… » quand l'agent est déjà trouvé.
  async function detect(kind: AgentKind, quiet = false) {
    const current = status[kind]
    const run = (runs[kind] ?? 0) + 1
    runs[kind] = run
    if (!quiet || current.state !== 'found') current.state = 'checking'
    try {
      const probed = await agentProbe(kind, settings[kind].path)
      if (runs[kind] === run) Object.assign(current, probed, { state: 'found' })
    } catch (error) {
      if (runs[kind] !== run) return
      const state = isAppError(error) && error.kind === 'agentFailed' ? 'error' : 'missing'
      Object.assign(current, BLANK, { state })
    }
  }

  async function update(kind: AgentKind) {
    const current = status[kind]
    if (!current.latest || current.updating) return
    const target = current.latest
    current.updating = true
    const { t } = i18nGlobal()
    const toasts = useToastsStore()
    const name = agents[kind].name
    try {
      const message = await agentUpdate(kind)
      await detect(kind, true)
      // La CLI peut réussir sans rien installer (Homebrew, canal stable) : sa phrase dit pourquoi.
      if (current.latest) toasts.push({ title: t('settings.agents.notUpdatedTitle', { agent: name }), body: message })
      else toasts.push({ kind: 'success', title: t('settings.agents.updatedTitle', { agent: name }), body: t('settings.agents.updatedBody', { version: current.version ?? target }) })
    } catch (error) {
      toasts.push({ kind: 'error', title: t('settings.agents.notUpdatedTitle', { agent: name }), body: isAppError(error) ? error.message : String(error) })
    } finally {
      current.updating = false
    }
  }

  // Un tour réel fait foi : s'il contredit le compte affiché (connexion ou déconnexion faite
  // depuis un terminal), Réglages > Agents se remet à jour.
  function confirm(kind: AgentKind, outcome: TurnStatus) {
    const current = status[kind]
    if (current.state !== 'found') return
    const signedIn = current.account !== null
    if ((outcome === 'completed' && !signedIn) || (outcome === 'unauthenticated' && signedIn)) detect(kind, true)
  }

  // Quotas envoyés par l'agent pendant un tour : la page Agents suit sans relancer la sonde.
  function track(kind: AgentKind, { session, weekly, model }: Extract<AgentEvent, { type: 'usage' }>) {
    const current = status[kind]
    const usage = current.usage ?? { session: null, weekly: null, models: [] }
    if (session) usage.session = session
    if (weekly) usage.weekly = weekly
    // L'événement ne nomme pas le modèle : seul celui que la sonde a vu peut le recevoir.
    const [only, ...others] = usage.models
    if (model && only && !others.length) usage.models = [{ ...only, quota: model }]
    current.usage = usage
  }

  function setPath(kind: AgentKind, path: string | null) {
    settings[kind].path = path
    return detect(kind)
  }

  function chatDefaults(kind: AgentKind): TurnOptions {
    return { ...settings[kind].defaults }
  }

  for (const kind of kinds) detect(kind)

  // Nouvelle recherche demandée par un clic : le message dit si l'agent est là.
  async function refresh(kind: AgentKind) {
    await detect(kind, true)
    const { t } = i18nGlobal()
    const name = agents[kind].name
    const current = status[kind]
    // Encore en cours : une autre recherche, lancée depuis, donnera le résultat.
    if (current.state === 'checking') return
    if (current.state === 'error') {
      return useToastsStore().push({ kind: 'error', title: t('feedback.refreshFailed'), body: t('settings.agents.error', { agent: name, command: agents[kind].command }) })
    }
    if (current.state !== 'found') {
      const body = settings[kind].path ? t('feedback.pathMissing', { path: settings[kind].path }) : t('settings.install.notInstalled', { tool: name })
      return useToastsStore().push({ kind: 'error', title: t('feedback.agentMissing', { agent: name }), body })
    }
    const version = t('settings.agents.versionShort', { version: current.version })
    useToastsStore().push(
      current.account
        ? { kind: 'success', title: t('feedback.agentFound', { agent: name }), body: version }
        : { kind: 'error', title: t('feedback.agentFound', { agent: name }), body: `${version} · ${t('settings.agents.status.signedOut')}` },
    )
  }

  return { settings, status, detect, refresh, update, confirm, track, setPath, chatDefaults }
})
