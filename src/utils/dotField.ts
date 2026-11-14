// Fond de la session vierge, en points de 2 px sur une grille de 5 px. Au repos : des étoiles, plus marquées vers le
// bas (le haut reste calme pour le titre), et de temps en temps une étoile filante. Le pointeur allume un halo
// bleu léger ; bouton tenu, il laisse une traîne violette et rose ; relâché, une onde part, suivie d'un écho.

const PITCH = 5
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const SIZE = 2
const RADIUS = 110
const TRAIL_RADIUS = 70
const FADE = 0.18
const TRAIL_FADE = 0.45
const WAVE_RADIUS = 260
const WAVE_LIFE = 1
const WAVE_BAND = 16
// Ciel tiré une fois, en px depuis le bord gauche et depuis le bas : ouvrir un panneau ou agrandir la fenêtre découvre
// ou cache des étoiles sans en déplacer une seule.
const SKY_WIDTH = 4000
const SKY_RISE = 900
const STAR_AREA = 12000
const STAR_REACH = 0.8
const STAR_MARGIN = 8
const STAR_FLOOR = 24
// Vue moins de 15 s en général : la première passe vite, puis de temps en temps sans insister.
const METEOR_EVERY: [number, number] = [9, 16]

interface Star {
  x: number
  rise: number
  base: number
  speed: number
  phase: number
  big: boolean
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  length: number
}

interface Wave {
  x: number
  y: number
  age: number
  strength: number
}

interface Point {
  x: number
  y: number
  strength: number
  held: boolean
}

// Trame ordonnée (Bayer 4×4) : un point s'allume si l'intensité dépasse son seuil dans la matrice.
function inked(tone: number, col: number, row: number) {
  return tone > (BAYER[(row & 3) * 4 + (col & 3)]! + 0.5) / 16
}

export class DotField {
  private cols = 0
  private rows = 0
  private width = 0
  private height = 0
  private glow = new Float32Array(0)
  private trail = new Float32Array(0)
  private points: Point[] = []
  private pointer: { x: number; y: number; at: number } | null = null
  private held: { x: number; y: number } | null = null
  private waves: Wave[] = []
  private stars: Star[] = Array.from({ length: Math.round((SKY_WIDTH * SKY_RISE) / STAR_AREA) }, () => ({
    x: Math.round((Math.random() * SKY_WIDTH) / PITCH) * PITCH,
    rise: Math.round((Math.random() ** 1.15 * SKY_RISE) / PITCH) * PITCH,
    base: 0.4 + Math.random() * 0.45,
    speed: 0.7 + Math.random() * 1.8,
    phase: Math.random() * Math.PI * 2,
    big: Math.random() < 0.08,
  }))
  private meteors: Meteor[] = []
  private nextMeteor = 2 + Math.random() * 3
  private time = 0
  private peak = 0
  // Zones sans étoile (le champ de saisie et le titre, élargis) : une étoile collée à leur bord fait tache.
  private clear: { left: number; top: number; right: number; bottom: number }[] = []

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    const cols = Math.ceil(width / PITCH)
    const rows = Math.ceil(height / PITCH)
    if (cols === this.cols && rows === this.rows) return
    this.cols = cols
    this.rows = rows
    this.glow = new Float32Array(cols * rows)
    this.trail = new Float32Array(cols * rows)
    this.peak = 0
  }

  avoid(zones: { left: number; top: number; right: number; bottom: number }[]) {
    this.clear = zones
  }

  // Le pointeur ou une onde demandent 30 images par seconde ; les étoiles seules se contentent de moins.
  busy() {
    return this.peak > 0.01 || this.points.length > 0 || this.waves.length > 0
  }

  // Un point tous les 8 px du trajet ; un geste lent allume moins qu'un geste vif.
  moved(x: number, y: number, at: number) {
    const last = this.pointer
    this.pointer = { x, y, at }
    if (this.held) this.held = { x, y }
    if (!last) return
    const dx = x - last.x
    const dy = y - last.y
    const distance = Math.hypot(dx, dy)
    const speed = distance / Math.max((at - last.at) / 1000, 1 / 240)
    // Halo de survol d'intensité fixe : un geste vif n'ajoute pas une seconde couche plus vive par-dessus.
    const strength = this.held ? Math.min(Math.max(speed / 800, 0.5), 1) : 0.55
    const steps = Math.min(Math.ceil(distance / 8), 60)
    const held = !!this.held
    for (let i = 1; i <= steps; i++) this.points.push({ x: last.x + (dx * i) / steps, y: last.y + (dy * i) / steps, strength, held })
  }

  left() {
    this.pointer = null
  }

  pressed(x: number, y: number) {
    this.held = { x, y }
  }

  released() {
    if (!this.held) return
    const { x, y } = this.held
    this.waves.push({ x, y, age: 0, strength: 1 }, { x, y, age: -0.16, strength: 0.5 })
    this.held = null
  }

  private stamp(grid: Float32Array, point: Point, radius: number) {
    const { cols } = this
    const c0 = Math.max(0, Math.floor((point.x - radius) / PITCH))
    const c1 = Math.min(cols - 1, Math.ceil((point.x + radius) / PITCH))
    const r0 = Math.max(0, Math.floor((point.y - radius) / PITCH))
    const r1 = Math.min(this.rows - 1, Math.ceil((point.y + radius) / PITCH))
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const d = Math.hypot((col + 0.5) * PITCH - point.x, (row + 0.5) * PITCH - point.y)
        if (d >= radius) continue
        const value = (1 - d / radius) ** 2 * point.strength
        const i = row * cols + col
        if (value > grid[i]!) grid[i] = value
      }
    }
  }

  step(dt: number, meteors: boolean) {
    if (dt <= 0) return
    this.time += dt
    const injected = this.points.length > 0
    for (const point of this.points) this.stamp(point.held ? this.trail : this.glow, point, point.held ? TRAIL_RADIUS : RADIUS)
    this.points = []
    if (injected || this.peak > 0) {
      const glowFade = Math.exp(-dt / FADE)
      const trailFade = Math.exp(-dt / TRAIL_FADE)
      let peak = 0
      for (let i = 0; i < this.glow.length; i++) {
        const glow = this.glow[i]! * glowFade
        const trail = this.trail[i]! * trailFade
        this.glow[i] = glow < 0.005 ? 0 : glow
        this.trail[i] = trail < 0.005 ? 0 : trail
        peak = Math.max(peak, glow, trail)
      }
      this.peak = peak
    }
    for (const wave of this.waves) wave.age += dt
    this.waves = this.waves.filter((wave) => wave.age < WAVE_LIFE * (0.6 + 0.4 * wave.strength))

    for (const meteor of this.meteors) meteor.age += dt
    this.meteors = this.meteors.filter((meteor) => meteor.age < meteor.life)
    this.nextMeteor -= dt
    if (meteors && this.nextMeteor <= 0 && this.width > 0) {
      this.nextMeteor = METEOR_EVERY[0] + Math.random() * (METEOR_EVERY[1] - METEOR_EVERY[0])
      const leftward = Math.random() < 0.5
      const angle = (0.35 + Math.random() * 0.3) * (leftward ? -1 : 1)
      const speed = 520 + Math.random() * 260
      this.meteors.push({
        x: this.width * (leftward ? 0.45 + Math.random() * 0.5 : 0.05 + Math.random() * 0.5),
        y: this.height * Math.random() * 0.3,
        vx: Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        age: 0,
        life: 0.9 + Math.random() * 0.5,
        length: 40 + Math.random() * 40,
      })
    }
  }

  private wave(x: number, y: number) {
    let lit = 0
    for (const wave of this.waves) {
      if (wave.age < 0) continue
      const life = WAVE_LIFE * (0.6 + 0.4 * wave.strength)
      const t = wave.age / life
      const radius = WAVE_RADIUS * wave.strength ** 0.5 * (1 - (1 - t) ** 3)
      const off = Math.hypot(x - wave.x, y - wave.y) - radius
      if (Math.abs(off) < WAVE_BAND * 2.5) lit = Math.max(lit, Math.exp(-((off / WAVE_BAND) ** 2)) * wave.strength * (1 - t) ** 1.2)
    }
    return lit
  }

  // `colors` : bleu, violet, rose puis la couleur du texte. `alphas` : halo bleu, traîne, onde. `starAlpha` : étoiles.
  paint(context: CanvasRenderingContext2D, colors: string[], alphas: number[], starAlpha: number) {
    context.clearRect(0, 0, this.width, this.height)
    const waving = this.waves.some((wave) => wave.age >= 0)

    if (this.peak > 0 || waving) {
      // Lots par couleur et par palier d'intensité : bleu (halo et onde), violet puis rose (traîne).
      const batches: number[][] = [[], [], [], [], []]
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const i = row * this.cols + col
          const x = (col + 0.5) * PITCH
          const y = (row + 0.5) * PITCH
          const trail = this.trail[i]!
          const blue = Math.min(Math.max(this.glow[i]!, waving ? this.wave(x, y) : 0), 1)
          const px = col * PITCH + (PITCH - SIZE) / 2
          const py = row * PITCH + (PITCH - SIZE) / 2
          if (trail > blue && trail > 0.02 && inked(trail, col, row)) batches[trail > 0.5 ? 4 : 3]!.push(px, py)
          else if (blue > 0.02 && inked(blue, col, row)) batches[this.glow[i]! >= blue ? 0 : blue > 0.5 ? 2 : 1]!.push(px, py)
        }
      }
      const style = [
        [colors[0]!, alphas[0]!],
        [colors[0]!, alphas[2]! * 0.7],
        [colors[0]!, alphas[2]!],
        [colors[1]!, alphas[1]!],
        [colors[2]!, alphas[1]! * 1.3],
      ] as const
      batches.forEach((list, index) => {
        if (!list.length) return
        context.fillStyle = style[index]![0]
        context.globalAlpha = style[index]![1]
        for (let k = 0; k < list.length; k += 2) context.fillRect(list[k]!, list[k + 1]!, SIZE, SIZE)
      })
    }

    // Pleines près du bas, de plus en plus pâles en montant jusqu'à 80 % de la hauteur, jamais collées à un bord.
    const reach = this.height * STAR_REACH
    for (const star of this.stars) {
      if (star.x < STAR_MARGIN || star.x > this.width - STAR_MARGIN || star.rise < STAR_FLOOR || star.rise > reach) continue
      const twinkle = (0.5 + 0.5 * Math.sin(star.phase + this.time * star.speed)) ** 2
      const x = star.x + (PITCH - SIZE) / 2
      const y = this.height - star.rise + (PITCH - SIZE) / 2
      if (this.clear.some((zone) => x > zone.left && x < zone.right && y > zone.top && y < zone.bottom)) continue
      const col = Math.floor(star.x / PITCH)
      const row = Math.floor((this.height - star.rise) / PITCH)
      const i = row * this.cols + col
      const lit = (row >= 0 && row < this.rows && col < this.cols ? this.trail[i]! : 0) + (waving ? this.wave(x, y) : 0)
      const fade = (1 - star.rise / reach) ** 1.3
      const alpha = Math.min(star.base * fade * (0.3 + 0.7 * twinkle) + lit * 0.5, 1) * starAlpha
      if (alpha < 0.02) continue
      context.fillStyle = colors[3]!
      context.globalAlpha = alpha
      context.fillRect(x, y, SIZE, SIZE)
      // Les plus grosses lancent une petite croix au sommet de leur scintillement.
      if (star.big && twinkle > 0.6) {
        context.globalAlpha = alpha * (twinkle - 0.6) * 1.5
        context.fillRect(x - SIZE, y, SIZE, SIZE)
        context.fillRect(x + SIZE, y, SIZE, SIZE)
        context.fillRect(x, y - SIZE, SIZE, SIZE)
        context.fillRect(x, y + SIZE, SIZE, SIZE)
      }
    }

    for (const meteor of this.meteors) {
      const t = meteor.age / meteor.life
      const fade = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1
      const speed = Math.hypot(meteor.vx, meteor.vy)
      const ux = meteor.vx / speed
      const uy = meteor.vy / speed
      const hx = meteor.x + meteor.vx * meteor.age
      const hy = meteor.y + meteor.vy * meteor.age
      for (let k = 0; k < meteor.length; k += 3) {
        const along = 1 - k / meteor.length
        context.fillStyle = colors[k < 6 ? 3 : 0]!
        context.globalAlpha = along ** 1.6 * fade * (k < 6 ? 0.6 : 0.35) * starAlpha
        context.fillRect(Math.round((hx - ux * k) / SIZE) * SIZE, Math.round((hy - uy * k) / SIZE) * SIZE, SIZE, SIZE)
      }
    }
    context.globalAlpha = 1
  }
}
