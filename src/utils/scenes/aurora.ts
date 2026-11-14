import type { Scene } from './types'

// Aurore boréale : deux ou trois rubans tramés se lèvent du bas, ondulent lentement puis retombent.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const PALETTES = [['s', 'b', 'v'], ['s', 'v'], ['b', 'v'], ['s', 'b'], ['s', 's', 'v']] as const
// Points visés au plus fort : au-delà (bande large, rubans qui se croisent), toute la trame s'allège.
const BUDGET = 340

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const ease = (t: number) => (1 - Math.cos(Math.PI * clamp(t))) / 2

const aurora: Scene = {
  name: 'aurora',
  duration: 8,
  draw(paint, t) {
    const palette = PALETTES[Math.floor(paint.pick(0) * PALETTES.length)]!
    const count = palette.length
    const ribbons = palette.map((ink, r) => {
      const seed = 10 + r * 20
      const rise = ease((t - 0.1 - r * 0.4) / 1.8)
      const fall = ease((t - 5.2 - (count - 1 - r) * 0.3) / 1.8)
      return {
        ink,
        lift: rise * (1 - fall),
        base: 12 + (r * 20) / Math.max(count - 1, 1) + (paint.pick(seed) - 0.5) * 4,
        swing: 3 + paint.pick(seed + 1) * 4,
        wave: (2 * Math.PI) / (55 + paint.pick(seed + 2) * 55),
        speed: (0.35 + paint.pick(seed + 3) * 0.35) * (paint.pick(seed + 4) < 0.5 ? -1 : 1),
        phase: paint.pick(seed + 5) * 6.3,
        top: 5 + paint.pick(seed + 6) * 4,
        fold: (2 * Math.PI) / (26 + paint.pick(seed + 7) * 26),
        drift: 0.5 + paint.pick(seed + 8) * 0.4,
        foldPhase: paint.pick(seed + 9) * 6.3,
        spot: 0.2 + paint.pick(seed + 10) * 0.6,
        peak: r === 0 ? 1 : 0.85,
        // Colonne en cours.
        center: 0,
        fray: 0,
        ray: 0,
        density: 0,
      }
    })

    // Deux passes : la première mesure l'intensité totale, la seconde trame à l'échelle qui tient le budget.
    let scale = 1
    for (let pass = 0; pass < 2; pass++) {
      let total = 0
      for (let x = 0; x < paint.width; x += 2) {
        for (const [r, ribbon] of ribbons.entries()) {
          const line =
            ribbon.base +
            ribbon.swing * Math.sin(x * ribbon.wave + t * ribbon.speed + ribbon.phase) +
            1.5 * Math.sin(x * ribbon.wave * 2.7 - t * 0.8 + ribbon.phase * 2)
          ribbon.center = line * (0.3 + 0.7 * ribbon.lift) - (1 - ribbon.lift) * 8
          // Rais du bas : une onde à pics étroits les groupe sur une ou deux colonnes, un tirage par colonne les casse.
          const rays = Math.max(Math.sin(x * 0.6 + ribbon.phase + t * 0.5), 0) ** 3 * (0.5 + 0.5 * Math.sin(x * 0.17 - t * 0.3))
          ribbon.fray = 3 + 15 * rays + paint.pick(400 + r * 200 + x) * 3
          ribbon.ray = 0.6 + 0.4 * rays
          const spread = 0.25 + 0.75 * Math.exp(-(((x / paint.width - ribbon.spot) / 0.4) ** 2))
          const fold = 0.5 + 0.5 * Math.sin(x * ribbon.fold + t * ribbon.drift + ribbon.foldPhase)
          ribbon.density = ribbon.peak * ribbon.lift * spread * (0.5 + 0.5 * fold)
        }
        for (let y = 0; y < paint.height; y += 2) {
          let best = 0
          let ink: (typeof palette)[number] = palette[0]
          for (const ribbon of ribbons) {
            // Cœur plein sur 3 pixels, fondu vers le haut, rais vers le bas.
            const d = y - ribbon.center
            const shape = d > 1.5 ? 1 - (d - 1.5) / ribbon.top : d < -1.5 ? ribbon.ray * (1 + (d + 1.5) / ribbon.fray) : 1
            if (shape * ribbon.density > best) {
              best = shape * ribbon.density
              ink = ribbon.ink
            }
          }
          // Plancher : sans lui, les franges sèment des points isolés un peu partout.
          best = Math.max(best - 0.1, 0)
          if (pass === 0) {
            total += Math.min(best, 1)
          } else if (best * scale > (BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)]! + 0.5) / 16) {
            paint.dot(x, y, ink, 0.35 + 0.5 * best)
          }
        }
      }
      scale = Math.min(1, BUDGET / Math.max(total, 1))
    }
  },
}

export default aurora
