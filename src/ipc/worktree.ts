import { invoke } from '@tauri-apps/api/core'
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'

export function worktreeSupport(path: string) {
  return invoke<WorktreeSupport>('worktree_support', { path })
}

export function worktreeList(path: string) {
  return invoke<Worktree[]>('worktree_list', { path })
}

export function worktreeBranches(path: string) {
  return invoke<string[]>('worktree_branches', { path })
}

// existing : la branche existe déjà ; sinon elle part du HEAD du projet.
export function worktreeCreate(projectId: string, path: string, branch: string, existing: boolean) {
  return invoke<Worktree>('worktree_create', { projectId, path, branch, existing })
}

// Rend les chats qui y travaillaient : ils repartent dans le dossier du projet.
export function worktreeRemove(path: string, worktree: string) {
  return invoke<string[]>('worktree_remove', { path, worktree })
}
