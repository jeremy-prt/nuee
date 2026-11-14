import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { isAppError } from '@/ipc/agent'
import type { GithubAccount } from '@/ipc/bindings/GithubAccount'
import type { GithubDeviceCode } from '@/ipc/bindings/GithubDeviceCode'
import type { GithubStatus } from '@/ipc/bindings/GithubStatus'
import { githubAvatar, githubLogin, githubLoginCancel, githubLoginOpen, githubStatus, githubSwitch } from '@/ipc/github'
import { useToastsStore } from '@/stores/toasts'

export type { GithubAccount, GithubStatus }

const STORAGE_KEY = 'nuee.integrations.v1'

// Le même login peut exister sur deux hôtes.
export const accountKey = (account: GithubAccount) => `${account.host}/${account.login}`

function defaultPrefs() {
  return { github: true, githubOff: [] as string[] }
}

function loadPrefs() {
  const prefs = defaultPrefs()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (saved.github === false) prefs.github = false
    if (Array.isArray(saved.githubOff)) prefs.githubOff = saved.githubOff.filter((key: unknown) => typeof key === 'string')
  } catch {
    // Choix illisibles : tous les comptes repartent activés.
  }
  return prefs
}

function message(error: unknown) {
  return isAppError(error) ? error.message : String(error)
}

// Comptes des services reliés à Nuée. GitHub : ceux de gh, jamais déconnectés, et rendus actifs seulement sur le
// bouton « Rendre actif » ; l'interrupteur de chaque compte ne vaut que pour Nuée.
export const useIntegrationsStore = defineStore('integrations', () => {
  const github = ref<GithubStatus | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)
  const prefs = reactive(loadPrefs())
  // Connexion en cours : `code` vaut null le temps que gh le demande à GitHub.
  const login = ref<{ code: GithubDeviceCode | null } | null>(null)
  const loginError = ref<string | null>(null)
  const avatars = reactive(new Map<string, string>())
  // Compte en train de devenir l'actif de gh (`hôte/login`).
  const switching = ref<string | null>(null)

  watch(
    prefs,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      } catch {
        // Stockage indisponible : le choix reste valable pour la session.
      }
    },
    { deep: true },
  )

  // Seule la dernière lecture lancée écrit l'état.
  let run = 0
  async function load() {
    const current = ++run
    checking.value = true
    try {
      const status = await githubStatus()
      if (current !== run) return
      github.value = status
      error.value = null
      if (status.state === 'ready') loadAvatars(status.accounts)
    } catch (failure) {
      if (current === run) error.value = message(failure)
    } finally {
      if (current === run) checking.value = false
    }
  }

  function loadAvatars(accounts: GithubAccount[]) {
    for (const account of accounts) if (account.host === 'github.com') requestAvatar(account.login)
  }

  // Compte ou organisation de github.com : son avatar est lu une fois.
  const asked = new Set<string>()
  function requestAvatar(login: string) {
    if (!login || avatars.has(login) || asked.has(login)) return
    asked.add(login)
    githubAvatar(login)
      .then((avatar) => {
        if (avatar) avatars.set(login, avatar)
        else asked.delete(login)
      })
      .catch((failure) => {
        asked.delete(login)
        console.error('avatar', failure)
      })
  }

  function avatarOf(login: string) {
    return avatars.get(login) ?? null
  }

  function avatar(account: GithubAccount) {
    return account.host === 'github.com' ? avatarOf(account.login) : null
  }

  function used(account: GithubAccount) {
    return !prefs.githubOff.includes(accountKey(account))
  }

  function setUsed(account: GithubAccount, on: boolean) {
    const key = accountKey(account)
    const others = prefs.githubOff.filter((item) => item !== key)
    prefs.githubOff = on ? others : [...others, key]
  }

  function reset() {
    Object.assign(prefs, defaultPrefs())
  }

  // Relecture demandée par un clic : le message dit ce que GitHub CLI a répondu.
  async function refresh() {
    await load()
    const { t } = i18nGlobal()
    const toasts = useToastsStore()
    const status = github.value
    if (error.value) return toasts.push({ kind: 'error', title: t('feedback.refreshFailed'), body: error.value })
    if (status?.state === 'missing') return toasts.push({ kind: 'warning', title: t('feedback.githubMissing'), body: '' })
    if (status?.state === 'outdated') return toasts.push({ kind: 'warning', title: t('feedback.githubOutdated'), body: t('settings.github.outdated') })
    const count = status?.state === 'ready' ? status.accounts.length : 0
    if (!count) return toasts.push({ kind: 'warning', title: t('feedback.githubSignedOut'), body: '' })
    toasts.push({ kind: 'success', title: t('feedback.githubRefreshed'), body: t('settings.github.accountsCount', count) })
  }

  // `notify` : message de réussite, utile dans Réglages, pas là où le changement se voit déjà.
  async function makeActive(account: GithubAccount, notify = true) {
    if (switching.value) return
    switching.value = accountKey(account)
    const { t } = i18nGlobal()
    try {
      const status = await githubSwitch(account.host, account.login)
      // Une relecture partie avant le changement n'écrasera pas cet état plus récent.
      run++
      checking.value = false
      github.value = status
      error.value = null
      if (notify) useToastsStore().push({ kind: 'success', title: t('settings.github.switched'), body: t('settings.github.switchedBody', { login: account.login }) })
    } catch (failure) {
      useToastsStore().push({ kind: 'error', title: t('settings.github.switchFailed'), body: message(failure) })
    } finally {
      switching.value = null
    }
  }

  // Une connexion annulée ou remplacée ne touche plus à l'état.
  let attempt = 0
  async function connect() {
    if (login.value) return
    const current = ++attempt
    login.value = { code: null }
    loginError.value = null
    try {
      await githubLogin((code) => {
        if (current === attempt) login.value = { code }
      })
      if (current !== attempt) return
      const { t } = i18nGlobal()
      useToastsStore().push({ kind: 'success', title: t('settings.github.connected'), body: t('settings.github.connectedBody') })
      void load()
    } catch (failure) {
      if (current === attempt) loginError.value = message(failure)
    } finally {
      if (current === attempt) login.value = null
    }
  }

  async function cancelLogin() {
    attempt++
    login.value = null
    await githubLoginCancel()
  }

  async function openLoginPage() {
    try {
      await githubLoginOpen()
    } catch (failure) {
      loginError.value = message(failure)
    }
  }

  return { github, checking, error, prefs, login, loginError, switching, load, refresh, reset, avatar, avatarOf, requestAvatar, used, setUsed, makeActive, connect, cancelLogin, openLoginPage }
})
