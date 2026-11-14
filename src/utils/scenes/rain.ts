import type { Scene } from './types'

// Averse : des gouttes fines tombent en biais et éclaboussent le sol, puis la pluie cesse et un arc-en-ciel tramé
// paraît un instant.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BANDS = ['r', 'o', 'g', 's', 'b', 'v'] as const
const RAIN_FOR = 3.4
const BOW = 4.2

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const ease = (t: number) => (1 - Math.cos(Math.PI * clamp(t))) / 2

const rain: Scene = {
  name: 'rain',
  duration: 7.8,
  draw(paint, t) {
    const { width, height } = paint
    const dot = (x: number, y: number, ink: 'b' | 'w', alpha: number) => {
      const px = Math.round(x)
      const py = Math.round(y)
      if (alpha > 0.01 && px >= 0 && px < width && py >= 0 && py < height) paint.dot(px, py, ink, alpha)
    }
    // Pente en pixels de x par pixel de chute ; le signe donne le sens du vent.
    const slant = (paint.pick(0) < 0.5 ? -1 : 1) * (0.3 + paint.pick(1) * 0.2)

    for (let i = 0; i < width / 14; i++) dot(paint.pick(20 + i) * width, 0, 'w', 0.18)

    const drops = Math.round(width * 0.9)
    for (let i = 0; i < drops; i++) {
      const seed = 100 + i * 5
      const share = (i + paint.pick(seed)) / drops
      // Moins de gouttes au début et à la fin : l'averse monte puis s'éteint.
      if (paint.pick(seed + 1) > Math.sin(Math.PI * share) ** 0.7 + 0.05) continue
      const start = share * RAIN_FOR
      const speed = 55 + paint.pick(seed + 2) * 25
      const fall = (height + 3) / speed
      const age = t - start
      if (age < 0) continue
      const ground = 1 + paint.pick(seed + 3) * (width - 2)
      const ink = paint.pick(seed + 4) < 0.7 ? 'b' : 'w'
      const strength = ink === 'b' ? 0.5 : 0.32
      if (age < fall) {
        const y = height + 3 - age * speed
        const length = i % 3 === 0 ? 3 : 2
        for (let k = 0; k < length; k++) {
          dot(ground + slant * (y + k), y + k, ink, strength * (1 - k * 0.3))
        }
        continue
      }
      // Éclaboussure : deux ou trois points qui s'écartent et retombent.
      const splash = (age - fall) / 0.35
      if (splash >= 1) continue
      const spread = 1 + Math.round(splash * 1.5)
      const lift = splash < 0.55 ? 1 : 0
      const fade = strength * (1 - splash)
      dot(ground - spread, lift, ink, fade)
      dot(ground + spread, lift, ink, fade)
      if (i % 2 === 0 && splash < 0.4) dot(ground - Math.sign(slant), 2, ink, fade * 0.8)
    }

    // Arc-en-ciel : six bandes de 2 pixels, tramées et légères.
    if (t < BOW) return
    const life = ease((t - BOW) / 0.8) * (1 - ease((t - 6.2) / 1.1))
    if (life <= 0) return
    const radius = Math.min(38, Math.max(width * 0.36, 24))
    const cx = width * (0.3 + paint.pick(2) * 0.4)
    const sweep = clamp((t - BOW) / 1.4) * 1.3
    for (let x = Math.max(Math.ceil(cx - radius), 0); x <= Math.min(cx + radius, width - 1); x++) {
      for (let y = 1; y <= radius; y++) {
        const distance = Math.hypot(x - cx, y)
        const band = Math.floor((radius - distance) / 2)
        if (band < 0 || band >= BANDS.length) continue
        // Dévoilé dans le sens où file la pluie.
        const turn = Math.acos((x - cx) / distance) / Math.PI
        const along = slant > 0 ? turn : 1 - turn
        const level = 0.3 * life * clamp((sweep - along) / 0.3) * clamp(y / (radius * 0.6))
        if (level > (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16) paint.dot(x, y, BANDS[band]!, 0.42)
      }
    }
  },
}

export default rain
