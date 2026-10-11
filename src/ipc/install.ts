import { invoke } from '@tauri-apps/api/core'
import type { InstallTool } from '@/ipc/bindings/InstallTool'

export type { InstallTool }

// Ouvre la page d'installation officielle de l'outil : Nuée n'installe rien elle-même.
export function installOpen(tool: InstallTool) {
  return invoke<void>('install_open', { tool })
}
