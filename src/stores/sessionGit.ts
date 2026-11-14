import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { WorktreeChanges } from '@/ipc/bindings/WorktreeChanges'
import { worktreeBehind, worktreeChanges, worktreeUnpushed } from '@/ipc/worktree'

export interface SessionGit {
  changes: WorktreeChanges
  unpushed: boolean
}

// État git du dossier de chaque session (ligne de commit du volet Environnement, point sur son bouton), relu entre
// deux tours par `ChatPane` et après une action du volet Git.
export const useSessionGitStore = defineStore('sessionGit', () => {
  const states = reactive<Record<string, SessionGit>>({})
  // Sessions dont la lecture est en cours : le compteur de la barre de titre montre un squelette en attendant.
  const loading = reactive(new Set<string>())
  const requests: Record<string, number> = {}

  async function refresh(chatId: string, path: string) {
    const id = (requests[chatId] = (requests[chatId] ?? 0) + 1)
    loading.add(chatId)
    try {
      const [changes, unpushed] = await Promise.all([worktreeChanges(chatId, path), worktreeUnpushed(chatId, path)])
      if (requests[chatId] === id) states[chatId] = { changes, unpushed }
    } catch {
      if (requests[chatId] === id) delete states[chatId]
    } finally {
      if (requests[chatId] === id) loading.delete(chatId)
    }
  }

  // Commits à récupérer par pull. Le fetch passe par le réseau : une fois par minute au plus, sauf après un pull.
  const behind = reactive<Record<string, number>>({})
  const checkedAt: Record<string, number> = {}
  async function checkBehind(chatId: string, path: string, force = false) {
    if (!force && Date.now() - (checkedAt[chatId] ?? 0) < 60_000) return
    checkedAt[chatId] = Date.now()
    behind[chatId] = await worktreeBehind(chatId, path).catch(() => 0)
  }

  return { states, loading, refresh, behind, checkBehind }
})
