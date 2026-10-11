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

export async function pickImage(title: string) {
  const path = await open({ multiple: false, title, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] })
  return typeof path === 'string' ? path : null
}
