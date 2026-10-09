import { ref } from 'vue'
import { appVersion } from '@/ipc/system'

// Version publiée la plus récente (les brouillons de release ne sont pas renvoyés).
const LATEST_RELEASE = 'https://api.github.com/repos/jeremy-prt/nuee/releases/latest'

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'failed'

function isNewer(candidate: string, current: string) {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff) return diff > 0
  }
  return false
}

export function useUpdateCheck() {
  const status = ref<Status>('idle')
  const latest = ref<{ version: string; url: string } | null>(null)

  async function check() {
    status.value = 'checking'
    try {
      const [current, response] = await Promise.all([
        appVersion(),
        fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } }),
      ])
      // 404 : aucune version publiée pour l'instant.
      if (response.status === 404) {
        status.value = 'upToDate'
        return
      }
      if (!response.ok) throw new Error(`GitHub ${response.status}`)
      const release = (await response.json()) as { tag_name: string; html_url: string }
      latest.value = { version: release.tag_name.replace(/^v/, ''), url: release.html_url }
      status.value = isNewer(latest.value.version, current) ? 'available' : 'upToDate'
    } catch {
      status.value = 'failed'
    }
  }

  return { status, latest, check }
}
