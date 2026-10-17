import { defineStore } from 'pinia'
import { reactive, ref, toRefs, watch, watchEffect } from 'vue'
import { type Locale, locales, setLocale } from '@/i18n'
import { powerKeepAwake } from '@/ipc/power'
import { autostartEnabled, autostartSet } from '@/ipc/autostart'
import { isTauriApp } from '@/ipc/system'
import { useConversationsStore } from '@/stores/conversations'

export type LanguageChoice = Locale | 'auto'

// Jours avant la suppression d'une session archivée ; 0 la garde.
export const archiveDayChoices = [0, 7, 30, 90] as const
export type ArchiveDays = (typeof archiveDayChoices)[number]

// Jours sans nouveau message avant l'archivage automatique d'une session ; 0 le coupe.
export const autoArchiveChoices = [0, 7, 14, 30] as const
export type AutoArchiveDays = (typeof autoArchiveChoices)[number]

// Message envoyé pendant une réponse : il attend la fin du tour, ou rejoint la réponse en cours.
export type FollowUp = 'queue' | 'steer'

interface GeneralState {
  systemNotifications: boolean
  appNotifications: boolean
  sounds: boolean
  dockBadge: boolean
  keepAwake: boolean
  confirmDelete: boolean
  checkUpdates: boolean
  language: LanguageChoice
  archiveDays: ArchiveDays
  autoArchiveDays: AutoArchiveDays
  followUp: FollowUp
  autoResume: boolean
  mentionIgnored: boolean
}

const STORAGE_KEY = 'nuee.general.v1'

function defaults(): GeneralState {
  return {
    systemNotifications: true,
    appNotifications: true,
    sounds: true,
    dockBadge: true,
    keepAwake: true,
    confirmDelete: true,
    checkUpdates: true,
    language: 'auto',
    archiveDays: 30,
    autoArchiveDays: 30,
    followUp: 'queue',
    autoResume: true,
    mentionIgnored: true,
  }
}

function load(): GeneralState {
  const state = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    for (const key of Object.keys(state) as (keyof GeneralState)[]) {
      if (typeof state[key] === 'boolean' && typeof saved[key] === 'boolean') Object.assign(state, { [key]: saved[key] })
    }
    if (saved.language === 'auto' || locales.includes(saved.language)) state.language = saved.language
    if (archiveDayChoices.includes(saved.archiveDays)) state.archiveDays = saved.archiveDays
    if (autoArchiveChoices.includes(saved.autoArchiveDays)) state.autoArchiveDays = saved.autoArchiveDays
    if (saved.followUp === 'queue' || saved.followUp === 'steer') state.followUp = saved.followUp
  } catch {
    // Réglages illisibles : on repart des valeurs par défaut.
  }
  return state
}

// Réglages > Général. Le lancement à l'ouverture de session n'est pas enregistré ici : le système le retient,
// on le relit. null tant qu'il n'est pas lu, ou hors de l'app.
export const useGeneralStore = defineStore('general', () => {
  const conversations = useConversationsStore()
  const state = reactive(load())
  const autostart = ref<boolean | null>(null)
  let autostartPending = false

  async function loadAutostart() {
    if (!isTauriApp()) return
    autostart.value = await autostartEnabled().catch(() => null)
  }

  // Deux clics rapprochés ne lancent pas deux écritures dans le système en même temps.
  async function toggleAutostart(on: boolean) {
    if (autostartPending) return
    autostartPending = true
    const previous = autostart.value
    autostart.value = on
    try {
      await autostartSet(on)
    } catch (error) {
      console.error('lancement au démarrage', error)
      autostart.value = previous
    } finally {
      autostartPending = false
    }
  }

  watchEffect(() => setLocale(state.language))

  if (isTauriApp()) {
    watch(
      () => state.keepAwake && conversations.busy,
      (on) => {
        powerKeepAwake(on).catch((error) => console.error('veille', error))
      },
    )
  }

  watch(
    state,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // Stockage indisponible : les réglages restent valables pour la session.
      }
    },
    { deep: true },
  )

  function reset() {
    Object.assign(state, defaults())
    if (autostart.value) toggleAutostart(false)
  }

  return { ...toRefs(state), autostart, loadAutostart, toggleAutostart, reset }
})
