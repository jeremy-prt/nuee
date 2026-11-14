import type { Scene } from './types'

// La soucoupe : arrive en flottant, enlève un petit objet posé au sol avec son faisceau, puis file de l'autre côté.
const SAUCER = ['     www     ', '   wwwwwww   ', ' mmmmmmmmmmm ', 'wwwwwwwwwwwww', ' mmmmmmmmmmm ', '    mmmmm    ']
const PLANT = ['ss   ', ' s ss', ' sss ', '  s  ']
const ROOTS = [' m m ', 'm   m']
const ROCK = [' mmm ', 'mwmmm', 'mmmmm']
const GIFT = [' w w ', 'ggwgg', 'ggwgg', 'ggwgg']
const THINGS = [PLANT, ROCK, GIFT]

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3
const easeIn = (t: number) => clamp(t) ** 3
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * clamp(t))) / 2
// Léger dépassement à l'arrivée : la soucoupe se pose au-dessus de l'objet au lieu de s'y figer.
const easeBack = (t: number) => 1 + 1.9 * (clamp(t) - 1) ** 3 + 0.9 * (clamp(t) - 1) ** 2

const ARRIVE = 2.2
const BEAM_ON = 2.3
const LIFT = 2.9
const LIFTED = 5.1
const BEAM_OFF = 5.2
const LEAVE = 5.8

const ufo: Scene = {
  name: 'ufo',
  duration: 7.1,
  draw(paint, t) {
    const dir = paint.pick(0) < 0.5 ? 1 : -1
    const thing = THINGS[Math.floor(paint.pick(1) * THINGS.length)]!
    const glow = paint.pick(3) < 0.5 ? 'b' : 'v'
    const size = SAUCER[0]!.length
    const center = Math.round(paint.width * (0.4 + paint.pick(2) * 0.2))
    const from = dir > 0 ? -size : paint.width + size
    const to = dir > 0 ? paint.width + size * 2 : -size * 2
    for (let i = 0; i < paint.width / 14; i++) paint.dot(Math.floor(paint.pick(10 + i) * paint.width), 0, 'w', 0.25)

    const bob = Math.round(Math.sin(t * 2.4) * 1.2)
    let cx = center
    let lift = 0
    if (t < ARRIVE) {
      cx = from + (center - from) * easeBack(t / ARRIVE)
      lift = Math.round(4 * (1 - easeOut(t / ARRIVE)))
    } else if (t > LEAVE) {
      cx = center + (to - center) * easeIn(t - LEAVE)
      lift = 1 + Math.round(6 * easeIn(t - LEAVE))
    } else if (t > LIFTED && t < LIFTED + 0.25) {
      lift = -1
    } else if (t > LEAVE - 0.3) {
      lift = 1
    }
    const sx = Math.round(cx)
    const sy = 12 + lift + bob

    const top = sy - 1
    const reach = t < BEAM_OFF ? easeOut((t - BEAM_ON) / 0.4) : 1 - easeOut((t - BEAM_OFF) / 0.4)
    if (reach > 0 && t < LEAVE) {
      for (let y = Math.max(Math.round(top * (1 - reach)), 0); y <= top; y++) {
        const spread = 1.5 + ((top - y) / top) * 5
        const ring = (((y - t * 7) % 4) + 4) % 4 < 1 ? 0.25 : 0
        const edge = Math.floor(spread)
        for (let x = sx - edge; x <= sx + edge; x++) {
          if (Math.abs(x - sx) < edge && (x + y) % 2) continue
          paint.dot(x, y, glow, Math.abs(x - sx) === edge ? 0.5 : 0.3 + ring + 0.12 * Math.sin(t * 8 + x * 1.3 + y * 2.1))
        }
      }
    }

    // Deux rangs de plus que la trappe, pour que les racines de la plante entrent aussi.
    const hop = t > 2.65 && t < 2.9 ? 1 : 0
    const rise = Math.round(easeInOut((t - LIFT) / (LIFTED - LIFT)) * (sy + 2))
    const oy = hop + rise
    const sway = rise > 1 ? Math.round(Math.sin((t - LIFT) * 4) * 0.7) : 0
    const ox = center - Math.floor(thing[0]!.length / 2) + sway
    // `reveal` ne montre que le bas : la partie déjà entrée dans la soucoupe s'efface.
    const hidden = Math.max(0, oy + thing.length - sy)
    if (hidden < thing.length) {
      paint.sprite(thing, ox, oy, { reveal: Math.min(easeOut(t / 0.4), (thing.length - hidden) / thing.length) })
    }
    for (let row = 0; row < ROOTS.length && thing === PLANT; row++) {
      const y = oy - 1 - row
      if (y >= 0 && y < sy) paint.sprite([ROOTS[row]!], ox, y)
    }

    const left = sx - Math.floor(size / 2)
    paint.sprite(SAUCER, left, sy)
    const step = Math.floor(t * 5) % 3
    for (let i = 0; i < 4; i++) paint.dot(left + 1 + i * 3 + step, sy + 2, glow)
    if (reach > 0 && t < LEAVE) for (let i = -1; i <= 1; i++) paint.dot(sx + i, sy, glow, 0.5 + reach * 0.5)
    if (t > LEAVE && t < LEAVE + 1) {
      const speed = easeIn(t - LEAVE) * 0.6
      for (let i = 1; i <= 3; i++) paint.dot(sx - dir * (size / 2 + i * 3), sy + 2, 'w', speed * (1 - i / 4))
    }
  },
}

export default ufo
