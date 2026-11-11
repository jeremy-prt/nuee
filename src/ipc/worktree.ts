import { invoke } from '@tauri-apps/api/core'
import type { BranchList } from '@/ipc/bindings/BranchList'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangedFiles } from '@/ipc/bindings/ChangedFiles'
import type { CommitDone } from '@/ipc/bindings/CommitDone'
import type { CommitPage } from '@/ipc/bindings/CommitPage'
import type { FileDiff } from '@/ipc/bindings/FileDiff'
import type { HeadInfo } from '@/ipc/bindings/HeadInfo'
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

// Fichiers non commités du dossier de la session, chemins relatifs à `root` ; null hors git.
export function worktreeChangedFiles(chatId: string, path: string) {
  return invoke<ChangedFiles | null>('worktree_changed_files', { chatId, path })
}

// Diff d'un fichier de cette liste ; Rust refuse tout autre chemin.
export function worktreeFileDiff(chatId: string, path: string, file: string) {
  return invoke<FileDiff>('worktree_file_diff', { chatId, path, file })
}

// Remet ce seul fichier de la liste dans l'état du dernier commit ; Rust refuse tout autre chemin.
export function worktreeRevertFile(chatId: string, path: string, file: string) {
  return invoke<void>('worktree_revert_file', { chatId, path, file })
}

// Remet les fichiers confirmés encore dans la liste ; rend les dépôts git imbriqués laissés tels quels.
export function worktreeRevertAll(chatId: string, path: string, files: string[]) {
  return invoke<string[]>('worktree_revert_all', { chatId, path, files })
}

// Commit de tous les changements, fait par l'app sans agent ; refusé si le message est vide. Les dépôts git
// imbriqués restent hors du commit (`skipped`).
export function worktreeCommit(chatId: string, path: string, message: string) {
  return invoke<CommitDone>('worktree_commit', { chatId, path, message })
}

// Push de la branche courante, jamais forcé ; sans branche suivie, vers `origin` ou le seul dépôt distant.
export function worktreePush(chatId: string, path: string) {
  return invoke<HeadInfo>('worktree_push', { chatId, path })
}

// Journal de la branche courante, 50 commits à partir de `skip` ; `query` filtre les titres, une page peut revenir
// vide avec une suite.
export function worktreeLog(chatId: string, path: string, skip: number, query: string | null) {
  return invoke<CommitPage>('worktree_log', { chatId, path, skip, query })
}

export function worktreeCommitFiles(chatId: string, path: string, sha: string) {
  return invoke<ChangedFile[]>('worktree_commit_files', { chatId, path, sha })
}

// Diff d'un fichier de ce commit ; Rust refuse tout autre chemin.
export function worktreeCommitDiff(chatId: string, path: string, sha: string, file: string) {
  return invoke<FileDiff>('worktree_commit_diff', { chatId, path, sha, file })
}

// Des commits du dossier de la session restent à pousser ; faux sans dépôt distant.
export function worktreeUnpushed(chatId: string, path: string) {
  return invoke<boolean>('worktree_unpushed', { chatId, path })
}

// Dernier commit, branche et dépôt distant `origin` du dossier de la session, lus par git.
export function worktreeHead(chatId: string, path: string) {
  return invoke<HeadInfo>('worktree_head', { chatId, path })
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
