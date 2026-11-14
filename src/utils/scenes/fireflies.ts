import type { Scene } from './types'

// Des lucioles sortent de l'herbe, montent en dérivant et clignotent chacune à son rythme, puis s'accordent pour deux
// éclairs ensemble (comme les lucioles synchrones) avant de s'éteindre.
const TUFTS = [
  ['  m  ', 'm m m', ' mmm '],
  [' m   ', ' m  m', 'mm mm'],
  ['m  ', 'm m', 'mm '],
  [' m', 'm ', 'm '],
]
const GREEN = TUFTS.map((tuft) => tuft.map((row) => row.replaceAll('m', 's')))

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const ease = (t: number) => 1 - (1 - clamp(t)) ** 3
const smooth = (t: number) => clamp(t) * clamp(t) * (3 - 2 * clamp(t))
const flash = (phase: number) => {
  const p = phase - Math.floor(phase)
  return p < 0.45 ? Math.sin((Math.PI * p) / 0.45) ** 2 : 0
}
const together = (t: number) => Math.max(0, 1 - ((t - 5.4) / 0.32) ** 2) + Math.max(0, 1 - ((t - 6.6) / 0.32) ** 2)

const fireflies: Scene = {
  name: 'fireflies',
  duration: 8,
  draw(paint, t) {
    // Touffes d'herbe espacées, qui poussent au début.
    let x = Math.floor(paint.pick(0) * 6)
    for (let i = 0; x < paint.width; i++) {
      const green = paint.pick(2000 + i) < 0.4
      const tuft = (green ? GREEN : TUFTS)[Math.floor(paint.pick(1000 + i) * TUFTS.length)]!
      if (x + tuft[0]!.length > paint.width) break
      const reveal = ease((t - paint.pick(3000 + i) * 0.5) / 0.6)
      paint.sprite(tuft, x, 0, { reveal, alpha: green ? 0.45 : 0.6, flip: paint.pick(4000 + i) < 0.5 })
      x += tuft[0]!.length + 3 + Math.floor(paint.pick(5000 + i) * 9)
    }

    const sync = smooth((t - 4.6) / 0.6)
    const count = Math.round(paint.width / 10)
    for (let i = 0; i < count; i++) {
      const age = t - (0.4 + paint.pick(10 + i) * 3.2)
      if (age < 0) continue
      const fadeAt = 7.2 + paint.pick(30 + i) * 0.5
      const life = clamp(age / 0.8) * clamp((fadeAt - t) / 0.6)
      if (life <= 0) continue
      const seed = paint.pick(50 + i) * Math.PI * 2
      const drift = (paint.pick(90 + i) - 0.5) * age * 1.6 + Math.sin(age * 0.9 + seed) * 2.5
      const fx = 8 + paint.pick(70 + i) * (paint.width - 16) + drift
      const fy = 1 + ease(age / 4.5) * (5 + paint.pick(110 + i) * 13) + Math.sin(age * 1.6 + seed) * 0.8
      const own = flash(t / (1.5 + paint.pick(130 + i) * 0.8) + seed)
      const glow = own * (1 - sync) + together(t) * sync
      const ink = paint.pick(150 + i) < 0.25 ? 's' : 'g'
      paint.dot(fx, fy, ink, life * (0.15 + 0.85 * glow))
      if (glow > 0.35) {
        const halo = life * glow * 0.25
        paint.dot(fx - 1, fy, ink, halo)
        paint.dot(fx + 1, fy, ink, halo)
        paint.dot(fx, fy - 1, ink, halo)
        paint.dot(fx, fy + 1, ink, halo)
      }
    }
  },
}

export default fireflies
