import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { isAppError } from '@/ipc/agent'
import type { GithubAccount } from '@/ipc/bindings/GithubAccount'
import type { GithubDeviceCode } from '@/ipc/bindings/GithubDeviceCode'
import type { GithubStatus } from '@/ipc/bindings/GithubStatus'
import { githubAvatar, githubLogin, githubLoginCancel, githubLoginOpen, githubStatus } from '@/ipc/github'
import { useToastsStore } from '@/stores/toasts'

export type { GithubAccount, GithubStatus }

const STORAGE_KEY = 'nuee.integrations.v1'

// Le même login peut exister sur deux hôtes.
export const accountKey = (account: GithubAccount) => `${account.host}/${account.login}`

function loadPrefs() {
  const prefs = { github: true, githubOff: [] as string[] }
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

// Comptes des services reliés à Nuée. GitHub : ceux de gh, que Nuée ne modifie jamais (ni switch ni
// logout) ; l'interrupteur de chaque compte ne vaut que pour Nuée.
export const useIntegrationsStore = defineStore('integrations', () => {
  const github = ref<GithubStatus | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)
  const prefs = reactive(loadPrefs())
  // Connexion en cours : `code` vaut null le temps que gh le demande à GitHub.
  const login = ref<{ code: GithubDeviceCode | null } | null>(null)
  const loginError = ref<string | null>(null)
  const avatars = reactive(new Map<string, string>())

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
    for (const account of accounts) {
      if (account.host !== 'github.com' || !account.login || avatars.has(account.login)) continue
      githubAvatar(account.login)
        .then((avatar) => {
          if (avatar) avatars.set(account.login, avatar)
        })
        .catch((failure) => console.error('avatar', failure))
    }
  }

  function avatar(account: GithubAccount) {
    return account.host === 'github.com' ? (avatars.get(account.login) ?? null) : null
  }

  function used(account: GithubAccount) {
    return !prefs.githubOff.includes(accountKey(account))
  }

  function setUsed(account: GithubAccount, on: boolean) {
    const key = accountKey(account)
    const others = prefs.githubOff.filter((item) => item !== key)
    prefs.githubOff = on ? others : [...others, key]
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
      useToastsStore().push({ title: t('settings.github.connected'), body: t('settings.github.connectedBody') })
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

  return { github, checking, error, prefs, login, loginError, load, avatar, used, setUsed, connect, cancelLogin, openLoginPage }
})
