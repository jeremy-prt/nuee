import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { WorktreeChanges } from '@/ipc/bindings/WorktreeChanges'
import { worktreeChanges, worktreeUnpushed } from '@/ipc/worktree'

export interface SessionGit {
  changes: WorktreeChanges
  unpushed: boolean
}

// État git du dossier de chaque session (ligne de commit du volet Environnement, point sur son bouton), relu entre
// deux tours par `ChatPane` et après une action du volet Modifications.
export const useSessionGitStore = defineStore('sessionGit', () => {
  const states = reactive<Record<string, SessionGit>>({})
  const requests: Record<string, number> = {}

  async function refresh(chatId: string, path: string) {
    const id = (requests[chatId] = (requests[chatId] ?? 0) + 1)
    try {
      const [changes, unpushed] = await Promise.all([worktreeChanges(chatId, path), worktreeUnpushed(chatId, path)])
      if (requests[chatId] === id) states[chatId] = { changes, unpushed }
    } catch {
      if (requests[chatId] === id) delete states[chatId]
    }
  }

  return { states, refresh }
})
