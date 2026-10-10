/// <reference lib="webworker" />
import { type EffectLevel, type PixelEffect, pixelEffects } from '@/utils/backgroundEffects'

interface Request {
  id: number
  bytes: ArrayBuffer
  effect: PixelEffect
  level: EffectLevel
  maxSide: number
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const bitmap = await createImageBitmap(new Blob([data.bytes]))
    const scale = Math.min(1, data.maxSide / bitmap.width, data.maxSide / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('canvas indisponible')
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const source = context.getImageData(0, 0, width, height)
    const pixels = pixelEffects[data.effect]({ width, height, data: source.data }, data.level)
    context.putImageData(new ImageData(pixels, width, height), 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    self.postMessage({ id: data.id, blob })
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) })
  }
}
