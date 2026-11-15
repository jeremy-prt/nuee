import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { isAppError } from '@/ipc/agent'
import { type DevTool, type ToolUpdate, toolsCheck, toolsOpenRelease, toolsUpdate } from '@/ipc/tools'

export interface ToolState extends ToolUpdate {
  updating: boolean
  done: string | null
  error: string | null
}

// Outils de travail (gh, Node, pnpm) montrés dans la carte de mise à jour, lus une fois par lancement.
export const useToolsStore = defineStore('tools', () => {
  const items = ref<ToolState[]>([])
  const dismissed = reactive<Partial<Record<DevTool, string>>>({})
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

  function openRelease(tool: DevTool) {
    void toolsOpenRelease(tool).catch(() => {})
  }

  return { items, dismissed, check, update, openRelease }
})
