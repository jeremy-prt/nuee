import type { Scene } from './types'

// La fusée : la balise de la tour clignote trois fois, la passerelle se retire, la fusée décolle dans sa fumée.
// « x » prend l'encre tirée au sort (ailerons, fumée) : deux variantes préparées une fois pour toutes.
const ROCKET = [
  '   x   ',
  '  www  ',
  '  www  ',
  ' wwwww ',
  ' wwbww ',
  ' wbbbw ',
  ' wwbww ',
  ' wwwww ',
  ' wwwww ',
  'xwwwwwx',
  'xxwwwxx',
  'x mmm x',
  'x     x',
]
const TOWER = ['mmm', 'm m', 'mmm', 'm m', 'm m', 'mmm', 'm m', 'm m', 'mmm', 'm m', 'm m', 'mmm', 'm m', 'm m']
const FLAMES = [
  ['ggg', 'ogo', ' o '],
  ['ggg', 'ogo', 'ogo', ' o '],
]
const PUFFS = [[' x ', 'xxx', ' x '], [' xx ', 'xxxx', ' xx '], [' x x', 'x x ', ' x x']]
const HALO = [[-1, 0], [1, 0], [0, 1]] as const
const SPLASH = [2, 4, 5]

const tint = (art: string[], ink: string) => art.map((row) => row.replace(/x/g, ink))
const ROCKETS = { r: tint(ROCKET, 'r'), p: tint(ROCKET, 'p') }
const SMOKE = { m: PUFFS.map((art) => tint(art, 'm')), w: PUFFS.map((art) => tint(art, 'w')) }

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3

const BLINKS = [0.8, 1.4, 2.0]
const IGNITION = 2.6
const LIFTOFF = 3.0
const CLIMB = 2.1
const HEIGHT = 32
const SMOKE_COUNT = 20

const rocket: Scene = {
  name: 'rocket',
  duration: 6.6,
  draw(paint, t) {
    const cx = Math.round(paint.width * (0.35 + paint.pick(1) * 0.3))
    const side = paint.pick(2) < 0.5 ? 1 : -1
    const body = ROCKETS[paint.pick(3) < 0.5 ? 'r' : 'p']
    const tower = side > 0 ? cx + 6 : cx - 8
    for (let i = 0; i < paint.width / 14; i++) paint.dot(Math.floor(paint.pick(10 + i) * paint.width), 0, 'w', 0.25)

    paint.sprite(TOWER, tower, 0, { reveal: easeOut(t / 0.5), alpha: 0.7 })

    // Un pixel seul se voit mal à cette échelle : la balise a un halo.
    for (const start of BLINKS) {
      const phase = (t - start) / 0.35
      if (phase <= 0 || phase >= 1) continue
      const glow = Math.sin(Math.PI * phase)
      const bx = tower + 1
      const by = TOWER.length
      paint.dot(bx, by, 'r', glow)
      for (const [dx, dy] of HALO) paint.dot(bx + dx, by + dy, 'r', glow * 0.3)
    }

    const arm = Math.round(2 * (1 - clamp((t - 2.3) / 0.25)))
    for (let i = 0; i < arm; i++) paint.dot(side > 0 ? tower - 1 - i : tower + 3 + i, 8, 'm', 0.7)

    const climb = clamp((t - LIFTOFF) / CLIMB)
    const ry = HEIGHT * climb ** 2.2
    const shake = t > IGNITION + 0.1 && t < LIFTOFF + 0.15 ? Math.floor(t * 16) % 2 : 0
    const left = cx - 3 + shake

    for (let i = 0; i < SMOKE_COUNT; i++) {
      const born = IGNITION + (i / SMOKE_COUNT) * 1.3
      const age = (t - born) / (1.6 + paint.pick(200 + i) * 0.8)
      if (age <= 0 || age >= 1) continue
      const way = i % 2 ? 1 : -1
      const reach = 6 + paint.pick(300 + i) * Math.min(paint.width * 0.15, 18)
      const x = cx + way * (2 + easeOut(age * 1.4) * reach)
      const y = age * (1 + paint.pick(400 + i) * 3)
      const art = SMOKE[i % 3 ? 'm' : 'w'][age < 0.25 ? 0 : age < 0.6 ? 1 : 2]!
      paint.sprite(art, x - art[0]!.length / 2, y, { alpha: 0.5 * Math.min(age * 8, 1) * (1 - age) ** 1.5 })
    }

    for (let k = 0; k < 12; k++) {
      const level = 2 + k * 2
      const passed = LIFTOFF + CLIMB * ((level + 3) / HEIGHT) ** (1 / 2.2)
      const age = (t - passed) / 1.2
      if (age <= 0 || age >= 1) continue
      paint.dot(cx + (paint.pick(500 + k) - 0.5) * 3 * age, level, k % 2 ? 'm' : 'w', 0.35 * (1 - age))
    }

    if (ry > HEIGHT - 1) return
    paint.sprite(body, left, ry, { reveal: easeOut((t - 0.15) / 0.5) })

    if (t > IGNITION) {
      const flame = FLAMES[Math.floor(t * 12) % 2]!
      const nozzle = Math.round(ry) + 1
      for (let row = 0; row < flame.length; row++) {
        const y = nozzle - 1 - row
        if (y >= 0) paint.sprite([flame[row]!], left + 2, y, { alpha: Math.min((t - IGNITION) / 0.15, 1) })
      }
      // Les pieds des ailerons sont à ±3 : l'éclat au sol passe entre eux et au-delà.
      const splash = 1 - clamp(ry / 4)
      for (let d = 0; d < SPLASH.length && splash > 0; d++) {
        const offset = SPLASH[d]!
        const strength = splash * (0.75 + 0.25 * Math.sin(t * 30 + d)) * (1 - d * 0.3)
        paint.dot(cx - offset + shake, 0, d ? 'o' : 'g', strength)
        paint.dot(cx + offset + shake, 0, d ? 'o' : 'g', strength)
      }
    }
  },
}

export default rocket
