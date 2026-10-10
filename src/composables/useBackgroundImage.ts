import { type Ref, ref, watchEffect } from 'vue'
import { previewSrc } from '@/ipc/attachment'
import type { BackgroundEffect } from '@/stores/appearance'
import { type EffectLevel, type PixelEffect, pixelEffects } from '@/utils/backgroundEffects'

// Un seul worker et un cache par image et par effet : les vignettes d'effets réutilisent le calcul du fond.
let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>()
const cache = new Map<string, Promise<string>>()
// Le fichier n'est lu qu'une fois : chaque calcul en reçoit une copie, transférée au worker.
const files = new Map<string, Promise<ArrayBuffer>>()

function read(src: string) {
  let file = files.get(src)
  if (!file) {
    file = fetch(src).then((response) => response.arrayBuffer())
    file.catch(() => files.delete(src))
    files.set(src, file)
  }
  return file.then((bytes) => bytes.slice(0))
}

// Au-delà de 1600 px, le calcul prend plusieurs secondes pour un gain invisible derrière le voile.
// Les vignettes d'effets se calculent sur une petite version : elles arrivent tout de suite.
const SIDES = { full: 1600, small: 360 }
export type BackgroundSize = keyof typeof SIDES

function render(bytes: ArrayBuffer, effect: PixelEffect, level: EffectLevel, size: BackgroundSize) {
  if (!worker) {
    worker = new Worker(new URL('../utils/backgroundEffects.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      const request = pending.get(data.id)
      pending.delete(data.id)
      if (data.blob) request?.resolve(data.blob)
      else request?.reject(new Error(data.error))
    }
  }
  const id = ++nextId
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, bytes, effect, level, maxSide: SIDES[size] }, [bytes])
  })
}

export function backgroundUrl(path: string, effect: BackgroundEffect, level: EffectLevel, size: BackgroundSize) {
  const src = previewSrc(path)
  if (!(effect in pixelEffects)) return Promise.resolve(src)
  const key = `${path}|${effect}|${level}|${size}`
  let url = cache.get(key)
  if (!url) {
    url = read(src)
      .then((bytes) => render(bytes, effect as PixelEffect, level, size))
      .then((blob) => URL.createObjectURL(blob))
    // Un échec (image supprimée entre-temps) ne doit pas rester en cache.
    url.catch(() => cache.delete(key))
    cache.set(key, url)
  }
  return url
}

// Vignettes de la page des réglages calculées d'avance, quand l'app n'a rien d'autre à faire : sans ça
// elles apparaissent une à une à l'ouverture de la page.
export function preloadBackground(path: string, level: EffectLevel) {
  const run = () => {
    for (const effect of Object.keys(pixelEffects) as PixelEffect[]) backgroundUrl(path, effect, level, 'small').catch(() => {})
  }
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 })
  else setTimeout(run, 500)
}

// Image retirée ou remplacée : ses calculs gardés en mémoire partent avec elle.
export function forgetBackground(path: string) {
  files.delete(previewSrc(path))
  for (const [key, url] of cache) {
    if (!key.startsWith(`${path}|`)) continue
    cache.delete(key)
    url.then((objectUrl) => URL.revokeObjectURL(objectUrl)).catch(() => {})
  }
}

// URL affichable de l'image avec son effet ; null tant que le calcul tourne ou s'il a échoué.
export function useBackgroundImage(
  path: Ref<string | null>,
  effect: Ref<BackgroundEffect>,
  level: Ref<EffectLevel>,
  size: BackgroundSize = 'full',
) {
  const url = ref<string | null>(null)
  watchEffect((onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    if (!path.value) {
      url.value = null
      return
    }
    backgroundUrl(path.value, effect.value, level.value, size)
      .then((result) => {
        if (!stale) url.value = result
      })
      .catch(() => {
        if (!stale) url.value = null
      })
  })
  return url
}
