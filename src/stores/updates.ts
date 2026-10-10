import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18nGlobal } from '@/i18n'
import { appVersion, openGithubPage } from '@/ipc/system'
import { useToastsStore } from '@/stores/toasts'

// Version publiée la plus récente (les brouillons de release ne sont pas renvoyés).
const LATEST_RELEASE = 'https://api.github.com/repos/jeremy-prt/nuee/releases/latest'

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'failed'
// Une réponse de GitHub arrive parfois en 100 ms : l'indicateur clignoterait sans qu'on ait le temps de le lire.
const MIN_CHECK = 700

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNewer(candidate: string, current: string) {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff) return diff > 0
  }
  return false
}

// Partagé entre la recherche au lancement, le bouton des réglages et la pastille de la barre latérale.
export const useUpdatesStore = defineStore('updates', () => {
  const status = ref<Status>('idle')
  const latest = ref<{ version: string; url: string } | null>(null)

  async function fetchStatus(): Promise<Status> {
    try {
      const [current, response] = await Promise.all([
        appVersion(),
        fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } }),
      ])
      // 404 : aucune version publiée pour l'instant.
      if (response.status === 404) return 'upToDate'
      if (!response.ok) throw new Error(`GitHub ${response.status}`)
      const release = (await response.json()) as { tag_name: string; html_url: string }
      latest.value = { version: release.tag_name.replace(/^v/, ''), url: release.html_url }
      return isNewer(latest.value.version, current) ? 'available' : 'upToDate'
    } catch {
      return 'failed'
    }
  }

  async function check() {
    if (status.value === 'checking') return
    status.value = 'checking'
    const [next] = await Promise.all([fetchStatus(), pause(MIN_CHECK)])
    status.value = next
  }

  // Au lancement : silencieux, sauf si une version est sortie.
  async function checkOnLaunch() {
    await check()
    if (status.value !== 'available' || !latest.value) return
    const { t } = i18nGlobal()
    const { url, version } = latest.value
    useToastsStore().push({
      title: t('updates.availableTitle'),
      body: t('updates.available', { version }),
      action: { label: t('updates.view'), run: () => openGithubPage(url) },
    })
  }

  return { status, latest, check, checkOnLaunch }
})
