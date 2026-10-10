// Effets de l'image de fond. Flou et Dégradé sont du CSS ; les autres se calculent pixel par pixel
// (dans un worker, voir backgroundEffects.worker.ts). Fond sombre uniquement : sans encre, c'est noir.

export type EffectLevel = 0 | 1 | 2

export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

function luma(data: Uint8ClampedArray, index: number) {
  return data[index]! * 0.2126 + data[index + 1]! * 0.7152 + data[index + 2]! * 0.0722
}

// Tramé ordonné de Bayer 4×4 : chaque bloc est allumé ou éteint selon le seuil.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function dither({ width, height, data }: Pixels, level: EffectLevel) {
  const block = [2, 3, 5][level]!
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const threshold = BAYER[(Math.floor(y / block) % 4) * 4 + (Math.floor(x / block) % 4)]!
      const lit = luma(data, i) / 255 > (threshold + 0.5) / 16
      const gain = lit ? 255 / Math.max(data[i]!, data[i + 1]!, data[i + 2]!, 1) : 0.08
      for (let c = 0; c < 3; c++) out[i + c] = data[i + c]! * gain
      out[i + 3] = 255
    }
  }
  return out
}

// Caractères de 5×7, du plus clair au plus dense, agrandis selon l'intensité.
const GLYPHS = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 4, 0],
  [0, 0, 0, 14, 0, 0, 0],
  [0, 4, 0, 0, 4, 0, 0],
  [0, 0, 14, 0, 14, 0, 0],
  [0, 4, 4, 31, 4, 4, 0],
  [0, 21, 14, 31, 14, 21, 0],
  [10, 31, 10, 10, 31, 10, 0],
  [14, 17, 23, 21, 23, 16, 14],
]

function ascii({ width, height, data }: Pixels, level: EffectLevel) {
  const scale = level + 1
  const cellX = 6 * scale
  const cellY = 8 * scale
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(Math.floor(x / cellX) * cellX + cellX / 2, width - 1)
      const cy = Math.min(Math.floor(y / cellY) * cellY + cellY / 2, height - 1)
      const cell = (cy * width + cx) * 4
      const glyph = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(Math.sqrt(luma(data, cell) / 255) * GLYPHS.length))]!
      const column = Math.floor((x % cellX) / scale)
      const row = Math.floor((y % cellY) / scale)
      const ink = column < 5 && row < 7 && (glyph[row]! & (1 << (4 - column))) !== 0
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) out[i + c] = ink ? data[cell + c]! : 0
      out[i + 3] = 255
    }
  }
  return out
}

// Trame de demi-teinte : un point par cellule, d'autant plus gros que la zone est claire.
function halftone({ width, height, data }: Pixels, level: EffectLevel) {
  const size = [5, 8, 12][level]!
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(Math.floor(x / size) * size + size / 2, width - 1)
      const cy = Math.min(Math.floor(y / size) * size + size / 2, height - 1)
      const cell = (Math.floor(cy) * width + Math.floor(cx)) * 4
      const radius = (size / 2) * Math.sqrt(luma(data, cell) / 255) * 1.1
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) out[i + c] = data[cell + c]! * coverage
      out[i + 3] = 255
    }
  }
  return out
}

// Lignes de balayage d'écran cathodique, plus épaisses et plus sombres avec l'intensité.
function scanlines({ width, height, data }: Pixels, level: EffectLevel) {
  const period = [4, 5, 6][level]!
  const dark = [1, 2, 3][level]!
  const gain = [0.55, 0.35, 0.2][level]!
  const out = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y++) {
    if (y % period >= dark) continue
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) out[i + c] = data[i + c]! * gain
    }
  }
  return out
}

// Mosaïque : chaque bloc prend la couleur de son centre.
function pixelate({ width, height, data }: Pixels, level: EffectLevel) {
  const block = [8, 16, 32][level]!
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(Math.floor(x / block) * block + block / 2, width - 1)
      const cy = Math.min(Math.floor(y / block) * block + block / 2, height - 1)
      const cell = (cy * width + cx) * 4
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) out[i + c] = data[cell + c]!
      out[i + 3] = 255
    }
  }
  return out
}

export const pixelEffects = { dither, ascii, halftone, scanlines, pixelate }
export type PixelEffect = keyof typeof pixelEffects

// Flou et Dégradé, en CSS. `scale` ramène le flou à la taille d'une vignette (1 = taille réelle).
export function cssEffect(effect: string, level: EffectLevel, scale = 1) {
  if (effect === 'blur') return { filter: `blur(${[6, 14, 28][level]! * scale}px)`, transform: 'scale(1.1)' }
  if (effect === 'fade') {
    const end = [95, 75, 55][level]!
    return { maskImage: `linear-gradient(to bottom, #000 ${end - 60}%, transparent ${end}%)` }
  }
  return {}
}
