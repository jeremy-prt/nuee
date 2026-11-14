// Lisibilité du texte sur le fond de la fenêtre, d'après WCAG 2.2 (1.4.3 et 1.4.11) : couleurs sRGB de 0 à 1,
// superposées comme le navigateur les compose, dans l'espace sRGB et non en lumière linéaire.

export type Rgb = readonly [number, number, number]

export const TARGET = { text: 4.5, muted: 3 } as const

function linear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]: Rgb) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrast(a: Rgb, b: Rgb) {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

// `top` posé avec l'opacité `alpha` sur `bottom`.
export function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return [top[0] * alpha + bottom[0] * (1 - alpha), top[1] * alpha + bottom[1] * (1 - alpha), top[2] * alpha + bottom[2] * (1 - alpha)]
}

// Les seules couleurs à lire sont celles de `palette()` (utils/themes.ts) : `hsl(240 0% 96%)`.
export function hslColor(css: string): Rgb {
  const [h = 0, s = 0, l = 0] = (css.match(/[\d.]+/g) ?? []).map(Number)
  const saturation = s / 100
  const lightness = l / 100
  const chroma = saturation * Math.min(lightness, 1 - lightness)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [channel(0), channel(8), channel(4)]
}

// L'image réduite, recadrée comme la zone centrale l'affiche (bg-cover).
export interface Pixels {
  width: number
  height: number
  data: ArrayLike<number>
}

// Ce que donne un jeu de crans : parts de 0 à 1.
export interface Look {
  chrome: number
  surface: number
  veil: Rgb
  image: number
  // Flou du bas actif : son voile mêle le bas de l'image à `canvas`.
  fade: boolean
}

export interface Scene {
  canvas: Rgb
  content: Rgb
  // Part du texte dans `--color-muted`.
  muted: number
}

// Nuée ne voit pas le bureau sous la fenêtre : on le suppose assez sombre, cas courant et le plus défavorable au
// mode clair.
const DESKTOP: Rgb = [0.25, 0.25, 0.25]

// Paliers de `.background-veil` (main.css) : hauteur dans la zone, part de `canvas`.
const FADE: [number, number][] = [
  [0.16, 0],
  [0.38, 0.26],
  [0.55, 0.55],
  [0.75, 0.78],
]

function fadeAt(y: number) {
  if (y <= FADE[0]![0]) return 0
  for (let index = 1; index < FADE.length; index++) {
    const [top, from] = FADE[index - 1]!
    const [bottom, to] = FADE[index]!
    if (y <= bottom) return from + ((to - from) * (y - top)) / (bottom - top)
  }
  return FADE[FADE.length - 1]![1]
}

// Texte des messages et du titre, puis champ de saisie, sur la largeur de la conversation.
const ZONES = [
  [0.12, 0.62],
  [0.62, 1],
] as const
const SIDES = [0.1, 0.9] as const
// Part d'une zone laissée sous le seuil : un reflet ou un détail isolé ne doit pas tout assombrir.
const SPARE = 0.05

export interface Legibility {
  text: number
  muted: number
}

function ratios(background: Rgb, scene: Scene): Legibility {
  return { text: contrast(scene.content, background), muted: contrast(over(scene.content, scene.muted, background), background) }
}

function percentile(values: number[]) {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length * SPARE)] ?? Infinity
}

// Contraste garanti sur 95 % de chaque zone du centre et sur les panneaux (le voile seul, sur le bureau supposé).
export function measure(pixels: Pixels, look: Look, scene: Scene): Legibility {
  const panels = ratios(over(look.veil, look.chrome, DESKTOP), scene)
  const base = over(look.veil, look.surface, DESKTOP)
  const result = { ...panels }
  const left = Math.floor(pixels.width * SIDES[0])
  const right = Math.ceil(pixels.width * SIDES[1])
  for (const [top, bottom] of ZONES) {
    const text: number[] = []
    const muted: number[] = []
    for (let y = Math.floor(pixels.height * top); y < Math.ceil(pixels.height * bottom); y++) {
      const fade = look.fade ? fadeAt((y + 0.5) / pixels.height) : 0
      for (let x = left; x < right; x++) {
        const index = (y * pixels.width + x) * 4
        const pixel: Rgb = [pixels.data[index]! / 255, pixels.data[index + 1]! / 255, pixels.data[index + 2]! / 255]
        const ratio = ratios(over(over(scene.canvas, fade, pixel), look.image, base), scene)
        text.push(ratio.text)
        muted.push(ratio.muted)
      }
    }
    result.text = Math.min(result.text, percentile(text))
    result.muted = Math.min(result.muted, percentile(muted))
  }
  return result
}

// Un même jeu de crans vu dans un mode : ses parts, ses couleurs et le contraste à tenir.
export interface View {
  look: Look
  scene: Scene
  target?: Legibility
}

// Le premier candidat lisible dans toutes ses vues, dans l'ordre de préférence de l'appelant, sinon celui qui
// s'approche le plus des seuils.
export function pickLook(candidates: View[][], pixels: Pixels) {
  let best = { index: 0, margin: -Infinity }
  for (const [index, views] of candidates.entries()) {
    const margins = views.map((view) => {
      const result = measure(pixels, view.look, view.scene)
      const target = view.target ?? TARGET
      return Math.min(result.text / target.text, result.muted / target.muted)
    })
    const margin = Math.min(...margins)
    if (margin >= 1) return { index, legible: true }
    if (margin > best.margin) best = { index, margin }
  }
  return { index: best.index, legible: false }
}
