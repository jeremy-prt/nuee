import { invoke } from '@tauri-apps/api/core'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'

export function worktreeSupport(path: string) {
  return invoke<WorktreeSupport>('worktree_support', { path })
}
