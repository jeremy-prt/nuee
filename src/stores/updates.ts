import { defineStore } from 'pinia'
import { ref } from 'vue'
import { relaunch } from '@tauri-apps/plugin-process'
import { check as checkUpdate, type Update } from '@tauri-apps/plugin-updater'
import { i18nGlobal } from '@/i18n'
import { openGithubPage } from '@/ipc/system'
import { useToastsStore } from '@/stores/toasts'

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'failed'
// Une réponse de GitHub arrive parfois en 100 ms : l'indicateur clignoterait sans qu'on ait le temps de le lire.
const MIN_CHECK = 700

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function releaseUrl(version: string) {
  return `https://github.com/jeremy-prt/nuee/releases/tag/v${version}`
}

// Partagé entre la recherche au lancement, le bouton des réglages et la pastille de la barre latérale.
export const useUpdatesStore = defineStore('updates', () => {
  const status = ref<Status>('idle')
  const latest = ref<{ version: string; url: string } | null>(null)
  // Ressource côté Rust, hors réactivité : un proxy Vue casserait ses appels.
  let pending: Update | null = null

  async function fetchStatus(): Promise<Status> {
    try {
      const update = await checkUpdate()
      await pending?.close()
      pending = update
      if (!update) return 'upToDate'
      latest.value = { version: update.version, url: releaseUrl(update.version) }
      return 'available'
    } catch {
      return 'failed'
    }
  }

  async function check() {
    if (status.value === 'checking' || status.value === 'installing') return
    status.value = 'checking'
    const [next] = await Promise.all([fetchStatus(), pause(MIN_CHECK)])
    status.value = next
  }

  // Paquet que l'updater ne sait pas remplacer (.deb, droits insuffisants) : la page de la version prend le relais.
  async function install() {
    if (!pending || !latest.value || status.value === 'installing') return
    const { url } = latest.value
    status.value = 'installing'
    try {
      await pending.downloadAndInstall()
    } catch {
      status.value = 'available'
      await openGithubPage(url)
      return
    }
    await relaunch()
  }

  // Au lancement : silencieux, sauf si une version est sortie.
  async function checkOnLaunch() {
    await check()
    if (status.value !== 'available' || !latest.value) return
    const { t } = i18nGlobal()
    useToastsStore().push({
      title: t('updates.availableTitle'),
      body: t('updates.available', { version: latest.value.version }),
      action: { label: t('updates.install'), run: install },
    })
  }

  return { status, latest, check, install, checkOnLaunch }
})
