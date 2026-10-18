import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { Attachment } from '@/ipc/bindings/Attachment'

// Fichier collé : il n'a pas de chemin, Rust l'écrit dans le dossier des pièces jointes du chat.
export async function attachmentSave(chatId: string, file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return attachmentSaveBase64(chatId, file.name, base64)
}

export function attachmentSaveBase64(chatId: string, name: string, base64: string) {
  return invoke<Attachment>('attachment_save', { chatId, name, base64 })
}

export function attachmentImport(chatId: string, paths: string[]) {
  return invoke<Attachment[]>('attachment_import', { chatId, paths })
}

// Outil de capture de macOS ; null si elle est annulée.
export function attachmentCapture(chatId: string) {
  return invoke<Attachment | null>('attachment_capture', { chatId })
}

// Seuls les fichiers du dossier des pièces jointes s'affichent (scope assetProtocol de tauri.conf.json).
export function previewSrc(path: string) {
  return convertFileSrc(path)
}

export type FileDrop = { type: 'over'; x: number; y: number } | { type: 'drop'; x: number; y: number; paths: string[] } | { type: 'leave' }

// Glisser depuis le Finder : Tauri capte le dépôt pour toute la fenêtre et donne les chemins,
// à chacun de vérifier que le point tombe chez lui. Position en pixels physiques sauf sur macOS.
export function onFileDrop(handler: (event: FileDrop) => void) {
  // Hors de l'app (pnpm dev dans un navigateur), pas de webview Tauri à écouter.
  if (!isTauri()) return Promise.resolve(() => {})
  const scale = navigator.userAgent.includes('Mac') ? 1 : window.devicePixelRatio || 1
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'leave') return handler({ type: 'leave' })
    const x = payload.position.x / scale
    const y = payload.position.y / scale
    if (payload.type === 'drop') handler({ type: 'drop', x, y, paths: payload.paths })
    else handler({ type: 'over', x, y })
  })
}
