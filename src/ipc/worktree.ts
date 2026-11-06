import { invoke } from '@tauri-apps/api/core'
import type { BranchList } from '@/ipc/bindings/BranchList'
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeChanges } from '@/ipc/bindings/WorktreeChanges'
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

// Branches vues depuis le dossier de la session (son worktree, sinon le projet `path`).
export function worktreeRefs(chatId: string, path: string) {
  return invoke<BranchList>('worktree_refs', { chatId, path })
}

// Changements non commités du dossier de la session, fichiers non suivis compris ; zéro hors git.
export function worktreeChanges(chatId: string, path: string) {
  return invoke<WorktreeChanges>('worktree_changes', { chatId, path })
}

// Passe le dossier du projet sur une branche existante ; git refuse si des modifications seraient écrasées.
export function worktreeCheckout(path: string, branch: string) {
  return invoke<void>('worktree_checkout', { path, branch })
}

// existing : la branche existe déjà ; sinon elle part du HEAD du projet.
export function worktreeCreate(projectId: string, path: string, branch: string, existing: boolean) {
  return invoke<Worktree>('worktree_create', { projectId, path, branch, existing })
}

// Rend les chats qui y travaillaient : ils repartent dans le dossier du projet.
export function worktreeRemove(path: string, worktree: string) {
  return invoke<string[]>('worktree_remove', { path, worktree })
}
