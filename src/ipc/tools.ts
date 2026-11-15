import { invoke } from '@tauri-apps/api/core'
import type { DevTool } from '@/ipc/bindings/DevTool'
import type { ToolUpdate } from '@/ipc/bindings/ToolUpdate'

export type { DevTool, ToolUpdate }

export function toolsCheck() {
  return invoke<ToolUpdate[]>('tools_check')
}

// Renvoie la version installée ensuite.
export function toolsUpdate(tool: DevTool) {
  return invoke<string>('tools_update', { tool })
}

export function toolsOpenRelease(tool: DevTool) {
  return invoke<void>('tools_open_release', { tool })
}
