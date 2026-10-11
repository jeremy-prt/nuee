import { open } from '@tauri-apps/plugin-dialog'

export async function pickFolder(title: string) {
  const path = await open({ directory: true, multiple: false, title })
  return typeof path === 'string' ? path : null
}

export async function pickFile(title: string) {
  const path = await open({ multiple: false, title })
  return typeof path === 'string' ? path : null
}

export async function pickFiles(title: string) {
  return (await open({ multiple: true, title })) ?? []
}

// Les formats acceptés par background_import côté Rust.
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

// Les formats acceptés par project_icon_set côté Rust.
export const ICON_EXTENSIONS = ['png', 'svg', 'ico', 'jpg', 'jpeg', 'gif', 'webp']

export async function pickImage(title: string, extensions = IMAGE_EXTENSIONS) {
  const path = await open({ multiple: false, title, filters: [{ name: 'Images', extensions }] })
  return typeof path === 'string' ? path : null
}
