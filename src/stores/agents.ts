import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { agentLogin, agentLoginCancel, agentLoginCode, agentLoginOpen, agentProbe, agentUpdate, isAppError } from '@/ipc/agent'
import type { AgentEvent } from '@/ipc/bindings/AgentEvent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { AgentStatus as Probed } from '@/ipc/bindings/AgentStatus'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { Quota } from '@/ipc/bindings/Quota'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { TurnStatus } from '@/ipc/bindings/TurnStatus'
import { usageRecord } from '@/ipc/usage'
import { useCatalogStore } from '@/stores/catalog'
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
  // Moment du dernier relevé de quotas réussi : une sonde refusée (429) garde les valeurs d'avant.
  usageAt: number | null
}

const STORAGE_KEY = 'nuee.agents.v1'
const BLANK = { path: null, version: null, latest: null, account: null, usage: null, usageAt: null }
const MODES: PermissionMode[] = ['bypass', 'auto', 'ask']
const kinds = Object.keys(agents) as AgentKind[]

// Chaque relevé de quota est gardé : la page Utilisation trace la vraie courbe de la fenêtre avec.
function remember(window: string, quota: Quota | null) {
  if (quota) usageRecord({ at: Date.now(), window, used: quota.used, resetsAt: quota.resetsAt }).catch(() => {})
}

export const DEFAULT_OPTIONS: TurnOptions = { mode: 'bypass', model: null, effort: null, fast: false }

function defaults(): AgentSettings {
  return { enabled: true, path: null, defaults: { ...DEFAULT_OPTIONS }, hooks: true }
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
  const probedAt: Partial<Record<AgentKind, number>> = {}

  // quiet : rafraîchir (quotas) sans repasser par « Recherche… » quand l'agent est déjà trouvé.
  async function detect(kind: AgentKind, quiet = false) {
    const current = status[kind]
    const run = (runs[kind] ?? 0) + 1
    runs[kind] = run
    if (!quiet || current.state !== 'found') current.state = 'checking'
    probedAt[kind] = Date.now()
    try {
      const probed = await agentProbe(kind, settings[kind].path)
      if (runs[kind] !== run) return
      // Claude refuse les relevés trop rapprochés (429) : la CLI rend alors des quotas vides, pas une erreur.
      const kept = !probed.usage && current.account?.email === probed.account?.email ? current.usage : null
      Object.assign(current, probed, { state: 'found', usage: probed.usage ?? kept })
      if (probed.usage) {
        current.usageAt = Date.now()
        remember('session', probed.usage.session)
        remember('weekly', probed.usage.weekly)
        for (const { model, quota } of probed.usage.models) remember(`weekly-${model}`, quota)
      }
      useCatalogStore().reload(kind)
    } catch (error) {
      if (runs[kind] !== run) return
      const state = isAppError(error) && error.kind === 'agentFailed' ? 'error' : 'missing'
      Object.assign(current, BLANK, { state })
    }
  }

  // `notify` faux : l'appelant montre lui-même le résultat (carte de mise à jour). Rend ce qui s'est passé.
  async function update(kind: AgentKind, notify = true): Promise<{ updated: boolean; message: string | null }> {
    const current = status[kind]
    if (!current.latest || current.updating) return { updated: false, message: null }
    const target = current.latest
    current.updating = true
    const { t } = i18nGlobal()
    const toasts = useToastsStore()
    const name = agents[kind].name
    try {
      const message = await agentUpdate(kind)
      await detect(kind, true)
      // La CLI peut réussir sans rien installer (Homebrew, canal stable) : sa phrase dit pourquoi.
      const updated = !current.latest
      if (notify && !updated) toasts.push({ title: t('settings.agents.notUpdatedTitle', { agent: name }), body: message })
      else if (notify) toasts.push({ kind: 'success', title: t('settings.agents.updatedTitle', { agent: name }), body: t('settings.agents.updatedBody', { version: current.version ?? target }) })
      return { updated, message: updated ? null : message }
    } catch (error) {
      const message = isAppError(error) ? error.message : String(error)
      if (notify) toasts.push({ kind: 'error', title: t('settings.agents.notUpdatedTitle', { agent: name }), body: message })
      return { updated: false, message }
    } finally {
      current.updating = false
    }
  }

  // Connexion du compte en cours, une seule à la fois. `page` : la CLI a ouvert la page de connexion et attend le
  // code qu'elle affiche ; `sending` : code en route, la CLI le vérifie.
  const login = ref<{ kind: AgentKind; page: boolean; sending: boolean } | null>(null)
  const loginError = ref<{ kind: AgentKind; message: string } | null>(null)
  const failure = (error: unknown) => (isAppError(error) ? error.message : String(error))

  // Une connexion annulée ou remplacée ne touche plus à l'état.
  let attempt = 0
  async function signIn(kind: AgentKind) {
    if (login.value) return
    const current = ++attempt
    login.value = { kind, page: false, sending: false }
    loginError.value = null
    try {
      await agentLogin(kind, () => {
        if (current === attempt && login.value) login.value.page = true
      })
      if (current !== attempt) return
      await detect(kind, true)
      const { t } = i18nGlobal()
      useToastsStore().push({ kind: 'success', title: t('agentLogin.done', { agent: agents[kind].name }), body: '' })
    } catch (error) {
      if (current === attempt) loginError.value = { kind, message: failure(error) }
    } finally {
      if (current === attempt) login.value = null
    }
  }

  async function sendLoginCode(code: string) {
    if (!login.value || login.value.sending) return
    const { kind } = login.value
    const current = attempt
    login.value.sending = true
    loginError.value = null
    try {
      await agentLoginCode(code)
    } catch (error) {
      if (current !== attempt) return
      if (login.value) login.value.sending = false
      loginError.value = { kind, message: failure(error) }
    }
  }

  async function openLoginPage() {
    try {
      await agentLoginOpen()
    } catch (error) {
      if (login.value) loginError.value = { kind: login.value.kind, message: failure(error) }
    }
  }

  async function cancelSignIn() {
    attempt++
    login.value = null
    await agentLoginCancel()
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
    current.usageAt = Date.now()
    remember('session', session)
    remember('weekly', weekly)
    if (model && only && !others.length) remember(`weekly-${only.model}`, model)
  }

  function setPath(kind: AgentKind, path: string | null) {
    settings[kind].path = path
    return detect(kind)
  }

  function chatDefaults(kind: AgentKind): TurnOptions {
    return { ...settings[kind].defaults }
  }

  function reset() {
    for (const kind of kinds) {
      const chosen = settings[kind].path !== null
      Object.assign(settings[kind], defaults())
      if (chosen) detect(kind)
    }
  }

  for (const kind of kinds) detect(kind)

  // Agent mis à jour hors de Nuée (terminal) : ses nouveaux modèles arrivent au retour sur la fenêtre, 10 min après la
  // dernière sonde au plus tôt (elle lance la CLI une à deux secondes).
  const REPROBE = 10 * 60 * 1000
  window.addEventListener('focus', () => {
    for (const kind of kinds) {
      if (status[kind].state === 'found' && Date.now() - (probedAt[kind] ?? 0) > REPROBE) detect(kind, true)
    }
  })

  // Quotas relus au plus toutes les 5 minutes : Claude bloque les relevés trop rapprochés (429), comme sa CLI.
  const USAGE_EVERY = 5 * 60 * 1000
  // Prochain relevé de quotas permis ; null : il peut partir tout de suite.
  function nextUsageAt(kind: AgentKind) {
    const next = (probedAt[kind] ?? 0) + USAGE_EVERY
    return next > Date.now() ? next : null
  }
  function refreshUsage(kind: AgentKind) {
    if (status[kind].state === 'found' && !nextUsageAt(kind)) return detect(kind, true)
  }

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
      const body = settings[kind].path ? t('feedback.pathMissing', { path: settings[kind].path }) : ''
      return useToastsStore().push({ kind: 'warning', title: t('feedback.agentMissing', { agent: name }), body })
    }
    const version = t('settings.agents.versionShort', { version: current.version })
    useToastsStore().push(
      current.account
        ? { kind: 'success', title: t('feedback.agentFound', { agent: name }), body: version }
        : { kind: 'warning', title: t('feedback.agentSignedOut', { agent: name }), body: version },
    )
  }

  // Carte de mise à jour : fermeture gardée en mémoire seulement (elle revient au lancement), dernier résultat affiché.
  const notice = reactive<{
    dismissed: Partial<Record<AgentKind, string>>
    result: { kind: AgentKind; version: string | null; error: string | null } | null
  }>({ dismissed: {}, result: null })
  // Ancienne fermeture retenue d'un lancement à l'autre : effacée pour que la carte revienne.
  try {
    localStorage.removeItem('nuee.agentUpdates.dismissed.v1')
  } catch {
    // Stockage indisponible : rien à effacer.
  }

  return { settings, status, notice, detect, refresh, refreshUsage, nextUsageAt, update, confirm, track, setPath, chatDefaults, reset, login, loginError, signIn, sendLoginCode, openLoginPage, cancelSignIn }
})
