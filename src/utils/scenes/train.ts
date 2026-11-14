import type { Scene } from './types'

// Un petit train traverse la bande sur ses rails, la cheminée crache des bouffées qui montent et se dissipent.
// Tout est dessiné vers la droite puis retourné en miroir quand il roule vers la gauche.
const LOCO = [
  'mmmmmmm     mmmm   ',
  ' wwwww       ww    ',
  ' wgggw   ww  ww    ',
  ' wgggwwwwwwwwwwmm  ',
  ' wwwwwwwwwwwwwwmmg ',
  ' aaaaaaaaaaaaaamm  ',
  ' wwwwwwwwwwwwwwmm  ',
  'mmmmmmmmmmmmmmmmmm ',
]
const COWCATCHER = ['m ', 'mm']
const WAGONS = [
  [' mmmmmmmm ', 'wwwwwwwwww', 'wggwggwggw', 'wggwggwggw', 'mmmmmmmmmm'],
  [' mmmmmmmm ', 'wwwwwwwwww', 'wggwmmwggw', 'wggwmmwggw', 'mmmmmmmmmm'],
  [' mmmmmmmm ', 'wwwwwwwwww', 'wmmwggwggw', 'wmmwggwggw', 'mmmmmmmmmm'],
]
const WHEELS = [
  [' m ', 'mwm', ' m '],
  ['m m', ' w ', 'm m'],
]
const GAP = 2
const WAGON = 10
const CHIMNEY = 13.5
const PUFF_EVERY = 0.28
const PUFF_LIFE = 1.6

// L'encre d'accent est choisie au tirage : on prépare les deux bandes de la locomotive une fois pour toutes.
const LOCOS = {
  b: LOCO.map((row) => row.replaceAll('a', 'b')),
  v: LOCO.map((row) => row.replaceAll('a', 'v')),
}

const train: Scene = {
  name: 'train',
  duration: 8,
  draw(paint, t) {
    const right = paint.pick(0) < 0.5
    const count = paint.pick(1) < 0.5 ? 2 : 3
    const loco = paint.pick(2) < 0.5 ? LOCOS.b : LOCOS.v
    const length = count * (WAGON + GAP) + LOCO[0]!.length
    const span = paint.width + length + 4
    const travel = (time: number) => -length - 2 + Math.min(Math.max((time - 0.1) / 7.5, 0), 1) * span
    const x = travel(t)

    const put = (art: readonly string[], left: number, y: number, alpha?: number) => {
      const w = art[0]!.length
      if (left + w < 0 || left > paint.width) return
      paint.sprite(art, right ? left : paint.width - left - w, y, { flip: !right, alpha })
    }
    const mirror = (left: number) => (right ? left : paint.width - 1 - left)

    for (let i = 1; i < paint.width; i += 3) paint.dot(i, 0, 'm', 0.45)

    // Les roues tournent au rythme de la distance parcourue, pas du temps.
    const wheel = WHEELS[Math.floor((x + 100) / 4) % 2]!
    for (let k = 0; k < count; k++) {
      const left = Math.round(x) + k * (WAGON + GAP)
      put(WAGONS[Math.floor(paint.pick(3 + k) * WAGONS.length)]!, left, 4)
      put(wheel, left + 1, 1)
      put(wheel, left + WAGON - 4, 1)
      put(['mm'], left + WAGON, 4)
    }
    const front = Math.round(x) + count * (WAGON + GAP)
    put(loco, front, 4)
    put(COWCATCHER, front + LOCO[0]!.length - 1, 2)
    for (const offset of [1, 5, 10, 14]) put(wheel, front + offset, 1)

    // Bouffées : chacune garde la place où elle est sortie, monte en ralentissant et s'efface.
    for (let k = Math.floor((t - PUFF_LIFE) / PUFF_EVERY); k * PUFF_EVERY <= t; k++) {
      const born = k * PUFF_EVERY
      const age = (t - born) / PUFF_LIFE
      if (born < 0 || age < 0 || age > 1) continue
      const cx = travel(born) + count * (WAGON + GAP) + CHIMNEY - age * 4
      const cy = 12 + (1 - (1 - age) ** 2) * 7
      const alpha = 0.45 * (1 - age)
      if (age < 0.15) {
        paint.dot(mirror(cx), cy, 'w', alpha)
      } else if (age < 0.55) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) paint.dot(mirror(cx + dx), cy + dy, 'w', alpha)
      } else {
        for (const [dx, dy] of [[-1, 0], [2, 0], [0, 2], [1, -1]] as const) paint.dot(mirror(cx + dx), cy + dy, 'w', alpha)
      }
    }
  },
}

export default train
