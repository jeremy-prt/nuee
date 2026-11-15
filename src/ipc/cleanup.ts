import { invoke } from '@tauri-apps/api/core'
import type { CleanupGroup } from '@/ipc/bindings/CleanupGroup'
import type { CleanupReport } from '@/ipc/bindings/CleanupReport'
import type { CleanupScan } from '@/ipc/bindings/CleanupScan'

export function cleanupScan(projects: string[]) {
  return invoke<CleanupScan>('cleanup_scan', { projects })
}

export function cleanupRun(groups: CleanupGroup[], projects: string[]) {
  return invoke<CleanupReport>('cleanup_run', { groups, projects })
}

export function cleanupForce() {
  return invoke<CleanupReport>('cleanup_force')
}
