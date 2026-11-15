import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { isAppError } from '@/ipc/agent'
import { type DevTool, type ToolUpdate, toolsCheck, toolsOpenRelease, toolsUpdate } from '@/ipc/tools'

export interface ToolState extends ToolUpdate {
  updating: boolean
  done: string | null
  error: string | null
}

const DISMISSED_KEY = 'nuee.tools.dismissed.v1'

function loadDismissed(): Partial<Record<DevTool, string>> {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

// Outils de travail (gh, Node, pnpm) montrés dans la carte de mise à jour, lus une fois par lancement.
export const useToolsStore = defineStore('tools', () => {
  const items = ref<ToolState[]>([])
  // Une simple info de version (outil que Nuée ne met pas à jour) fermée ne revient qu'avec une version plus récente ;
  // une mise à jour possible revient au lancement suivant.
  const remembered = loadDismissed()
  const dismissed = reactive<Partial<Record<DevTool, string>>>({ ...remembered })
  let checked = false

  async function check() {
    if (checked) return
    checked = true
    try {
      items.value = (await toolsCheck()).map((update) => ({ ...update, updating: false, done: null, error: null }))
    } catch {
      // Hors ligne ou outil muet : la carte ne montre que les agents.
    }
  }

  async function update(tool: DevTool) {
    const item = items.value.find((entry) => entry.tool === tool)
    if (!item || item.updating) return
    item.updating = true
    item.error = null
    try {
      item.done = await toolsUpdate(tool)
    } catch (error) {
      item.error = isAppError(error) ? error.message : String(error)
    } finally {
      item.updating = false
    }
  }

  function dismiss(item: ToolState) {
    dismissed[item.tool] = item.latest
    item.done = null
    if (item.updatable) return
    remembered[item.tool] = item.latest
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(remembered))
    } catch {
      // Stockage indisponible : elle reviendra au prochain lancement, rien de plus.
    }
  }

  function openRelease(tool: DevTool) {
    void toolsOpenRelease(tool).catch(() => {})
  }

  return { items, dismissed, check, update, dismiss, openRelease }
})
