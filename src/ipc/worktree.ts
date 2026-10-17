import { invoke } from '@tauri-apps/api/core'
import type { BranchList } from '@/ipc/bindings/BranchList'
import type { SwitchOutcome } from '@/ipc/bindings/SwitchOutcome'
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

// Branches vues depuis le dossier de la session (son worktree, sinon le projet `path`).
export function worktreeRefs(chatId: string, path: string) {
  return invoke<BranchList>('worktree_refs', { chatId, path })
}

// create : nouvelle branche partie du HEAD actuel. Blocked : des modifications non commitées l'empêchent.
export function worktreeSwitch(chatId: string, path: string, branch: string, create: boolean) {
  return invoke<SwitchOutcome>('worktree_switch', { chatId, path, branch, create })
}

// existing : la branche existe déjà ; sinon elle part du HEAD du projet.
export function worktreeCreate(projectId: string, path: string, branch: string, existing: boolean) {
  return invoke<Worktree>('worktree_create', { projectId, path, branch, existing })
}

// Rend les chats qui y travaillaient : ils repartent dans le dossier du projet.
export function worktreeRemove(path: string, worktree: string) {
  return invoke<string[]>('worktree_remove', { path, worktree })
}
