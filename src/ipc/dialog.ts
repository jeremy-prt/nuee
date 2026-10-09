import { open } from '@tauri-apps/plugin-dialog'

export async function pickFolder(title: string) {
  const path = await open({ directory: true, multiple: false, title })
  return typeof path === 'string' ? path : null
}
