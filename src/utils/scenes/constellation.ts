import type { Scene } from './types'

// Constellation : les étoiles s'allument une à une, un trait pointillé les relie, elle scintille, puis s'efface en
// suivant le tracé depuis la première étoile.

// Coordonnées pour une hauteur de 1. Dans `path`, -1 lève la plume ; une étoile hors du tracé s'efface en dernier.
const SHAPES: { stars: [number, number][]; path: number[]; flip: boolean }[] = [
  // Grande Ourse : la queue, puis la casserole qu'on referme.
  {
    stars: [[0, 0.62], [0.34, 0.86], [0.64, 0.82], [0.88, 0.64], [0.92, 0.18], [1.4, 0.1], [1.5, 0.6]],
    path: [0, 1, 2, 3, 4, 5, 6, 3],
    flip: true,
  },
  // N, pour Nuée.
  { stars: [[0, 0], [0, 1], [0.38, 0.5], [0.76, 0], [0.76, 1]], path: [0, 1, 2, 3, 4], flip: false },
  { stars: [[0, 0], [0.5, 0.45], [1, 0.9], [0.6, 0.88], [0.94, 0.48]], path: [0, 1, 2, 3, -1, 2, 4], flip: true },
  { stars: [[0.42, 1], [0.84, 0.5], [0.42, 0], [0, 0.5], [0.42, 0.5]], path: [0, 1, 2, 3, 0], flip: false },
]

const LIGHT = 0.3
const LINES = 2.6
const LINES_FOR = 1.8
const SPARKLE = 4.5
const ERASE = 5.8
const ERASE_FOR = 1.4

const CROSS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const bump = (t: number) => (t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0)

const xs: number[] = []
const ys: number[] = []
const along: number[] = []

const constellation: Scene = {
  name: 'constellation',
  duration: 8,
  draw(paint, t) {
    const dot = (x: number, y: number, ink: 'w' | 'g' | 'b', alpha: number) => {
      const px = Math.round(x)
      const py = Math.round(y)
      if (alpha > 0.01 && px >= 0 && px < paint.width && py >= 0 && py < paint.height) paint.dot(px, py, ink, alpha)
    }

    // Fond : quelques étoiles très pâles, pour la profondeur.
    const ambient = clamp(t / 1) * (1 - clamp((t - 6.4) / 1))
    for (let i = 0; i < paint.width / 16; i++) {
      const glimmer = 0.75 + 0.25 * Math.sin(t * 1.3 + i * 2.1)
      dot(paint.pick(50 + i) * paint.width, 2 + paint.pick(80 + i) * 44, 'w', (0.1 + 0.12 * paint.pick(110 + i)) * glimmer * ambient)
    }

    const shape = SHAPES[Math.floor(paint.pick(0) * SHAPES.length)]!
    const count = shape.stars.length
    const size = Math.min(24 + paint.pick(1) * 8, (paint.width - 14) / 1.5)
    const flip = shape.flip && paint.pick(2) < 0.5 ? -1 : 1
    const turn = (paint.pick(3) - 0.5) * 0.3
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    let left = Infinity
    let right = -Infinity
    let bottom = Infinity
    let top = -Infinity
    for (let i = 0; i < count; i++) {
      const [u, v] = shape.stars[i]!
      xs[i] = (u * flip * cos - v * sin) * size
      ys[i] = (u * flip * sin + v * cos) * size
      left = Math.min(left, xs[i]!)
      right = Math.max(right, xs[i]!)
      bottom = Math.min(bottom, ys[i]!)
      top = Math.max(top, ys[i]!)
    }
    const shiftX = 7 - left + paint.pick(4) * Math.max(paint.width - 14 - (right - left), 0)
    const shiftY = 6 - bottom + paint.pick(5) * Math.max(paint.height - 12 - (top - bottom), 0)
    for (let i = 0; i < count; i++) {
      xs[i] = xs[i]! + shiftX
      ys[i] = ys[i]! + shiftY
      along[i] = -1
    }

    let total = 0
    for (let j = 0; j < shape.path.length; j++) {
      const a = shape.path[j - 1] ?? -1
      const b = shape.path[j]!
      if (a >= 0 && b >= 0) total += Math.hypot(xs[b]! - xs[a]!, ys[b]! - ys[a]!)
      if (b >= 0 && along[b]! < 0) along[b] = total
    }

    const front = total * clamp((t - LINES) / LINES_FOR)
    const eraser = (total + 8) * clamp((t - ERASE) / ERASE_FOR) - 4
    const fading = (s: number) => clamp((s - eraser) / 5)
    const lineInk = paint.pick(6) < 0.6 ? 'b' : 'w'
    const glow = 1 + 0.5 * bump((t - SPARKLE) / 1.3)

    // Traits : un point tous les 2 pixels, à distance des étoiles, la tête du tracé plus vive.
    let walked = 0
    for (let j = 1; j < shape.path.length; j++) {
      const a = shape.path[j - 1]!
      const b = shape.path[j]!
      if (a < 0 || b < 0) continue
      const dx = xs[b]! - xs[a]!
      const dy = ys[b]! - ys[a]!
      const length = Math.hypot(dx, dy)
      for (let d = 3 + ((length - 6) % 2) / 2; d <= length - 3; d += 2) {
        const s = walked + d
        if (s > front) break
        const head = clamp(1 - (front - s) / 5)
        const base = lineInk === 'b' ? 0.38 : 0.24
        const alpha = (base * glow + 0.4 * head * (front < total ? 1 : 0)) * fading(s)
        dot(xs[a]! + (dx * d) / length, ys[a]! + (dy * d) / length, head > 0.5 && front < total ? 'w' : lineInk, alpha)
      }
      walked += length
    }

    // Étoiles : un éclat à l'allumage, une vague d'éclats pour le scintillement.
    for (let i = 0; i < count; i++) {
      const age = t - (LIGHT + (i * 2) / (count - 1))
      if (age < 0) continue
      const ink = paint.pick(20 + i) < 0.3 ? 'g' : 'w'
      const bright = 0.6 + 0.4 * paint.pick(10 + i)
      const s = along[i]! < 0 ? total : along[i]!
      const alpha = bright * clamp(age / 0.2) * (0.9 + 0.1 * Math.sin(t * 2.3 + i * 1.7)) * fading(s + 2)
      const flare = Math.max(bump(age / 0.8), bump((t - SPARKLE - i * 0.13) / 0.6), bright > 0.85 ? 0.35 : 0)
      const x = xs[i]!
      const y = ys[i]!
      dot(x, y, ink, alpha)
      if (flare > 0.05) {
        for (const [ox, oy] of CROSS) dot(x + ox, y + oy, ink, alpha * 0.45 * flare)
      }
      if (flare > 0.5) {
        for (const [ox, oy] of CROSS) dot(x + ox * 2, y + oy * 2, ink, alpha * 0.4 * (flare - 0.5))
      }
    }
  },
}

export default constellation
