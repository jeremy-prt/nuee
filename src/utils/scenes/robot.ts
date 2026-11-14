import type { Scene } from './types'

// Le petit robot des sous-agents arrive en sautillant, salue ou pose un cube et le regarde, a une petite pensée,
// puis repart par où il est venu. Tout est dessiné comme s'il entrait par la gauche, puis retourné en miroir.
type Eyes = 'front' | 'side' | 'down' | 'blink' | 'happy'

// (colonne, ligne) dans la grille de 11 sur 9 de `compose`, ligne 0 = tige de l'antenne.
const EYES: Record<Eyes, [number, number][]> = {
  front: [[3, 3], [3, 4], [7, 3], [7, 4]],
  side: [[4, 3], [4, 4], [8, 3], [8, 4]],
  down: [[4, 4], [4, 5], [8, 4], [8, 5]],
  blink: [[3, 4], [7, 4]],
  happy: [[3, 3], [2, 4], [4, 4], [7, 3], [6, 4], [8, 4]],
}
const MOUTH: Record<Eyes, number> = { front: 4, side: 5, down: -1, blink: 4, happy: 4 }

// Le bras avant est dessiné à part, il salue ou tient le cube.
function compose(ink: 'b' | 'w', eyes: Eyes) {
  const grid = Array.from({ length: 9 }, () => Array<string>(11).fill(' '))
  grid[0]![5] = 'm'
  for (let row = 1; row <= 7; row++) {
    const edge = row === 1 || row === 7 ? 2 : 1
    for (let col = edge; col <= 10 - edge; col++) grid[row]![col] = ink
  }
  grid[4]![0] = ink
  grid[5]![0] = ink
  for (const [col, row] of EYES[eyes]) grid[row]![col] = 'k'
  const mouth = MOUTH[eyes]
  if (mouth >= 0) for (let col = mouth; col < mouth + 3; col++) grid[6]![col] = 'k'
  grid[8]![3] = 'm'
  grid[8]![7] = 'm'
  return grid.map((row) => row.join(''))
}
const ROBOTS = {
  b: Object.fromEntries((Object.keys(EYES) as Eyes[]).map((eyes) => [eyes, compose('b', eyes)])) as Record<Eyes, string[]>,
  w: Object.fromEntries((Object.keys(EYES) as Eyes[]).map((eyes) => [eyes, compose('w', eyes)])) as Record<Eyes, string[]>,
}
// Coin bas-gauche à l'épaule.
const WAVE = [
  [' a  ', ' a  ', ' a  ', 'a   '],
  ['   a', '  a ', ' a  ', 'a   '],
]
const WAVES = {
  b: WAVE.map((frame) => frame.map((row) => row.replaceAll('a', 'b'))),
  w: WAVE.map((frame) => frame.map((row) => row.replaceAll('a', 'w'))),
}
const HEART = ['pp pp', 'ppppp', ' ppp ', '  p  ']
const BANG = ['g', 'g', ' ', 'g']
const BUBBLE = [' wwwwwww ', 'w       w', 'w       w', 'w       w', 'w       w', 'w       w', 'w       w', ' wwwwwww ']
const CUBE = ['ggg', 'ggg', 'ggg']

const HOP = 0.36
const HOPS = 6
const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
const ease = (v: number) => 1 - (1 - clamp(v)) ** 3
const smooth = (v: number) => clamp(v) * clamp(v) * (3 - 2 * clamp(v))

// Sauts réguliers de `from` à `to` : le robot n'avance qu'en l'air, et touche le sol un instant entre deux bonds.
function hops(t: number, start: number, count: number, from: number, to: number, height: number) {
  const f = (t - start) / HOP
  if (f <= 0) return { x: from, y: 0, moving: false }
  if (f >= count) return { x: to, y: 0, moving: false }
  const i = Math.floor(f)
  const air = Math.min((f - i) / 0.78, 1)
  return { x: from + ((i + air) / count) * (to - from), y: Math.round(Math.sin(Math.PI * air) * height), moving: true }
}

const robot: Scene = {
  name: 'robot',
  duration: 8.6,
  draw(paint, t) {
    const right = paint.pick(0) < 0.5
    const gift = paint.pick(1) < 0.5
    const heart = paint.pick(2) < 0.6
    const body = paint.pick(3) < 0.7 ? 'b' : 'w'
    const stop = Math.round(paint.width * (0.3 + paint.pick(4) * 0.12))
    const away = -9

    const mirror = (x: number) => (right ? x : paint.width - 1 - x)
    const place = (art: readonly string[], left: number, y: number, flip: boolean, alpha?: number, reveal?: number) => {
      const w = art[0]!.length
      paint.sprite(art, right ? left : paint.width - left - w, y, { flip: right ? flip : !flip, alpha, reveal })
    }

    // Trajet : arrivée, petit recul pour regarder le cube, demi-tour, départ.
    const rest = gift ? stop - 3 : stop
    const think = gift ? 3.55 : 3
    const leave = gift ? 6.05 : 5.85
    const motion =
      t >= leave ? hops(t, leave, HOPS, rest, away, 3) : t >= 2.95 ? hops(t, 2.95, 1, stop, rest, 2) : hops(t, 0, HOPS, away, stop, 3)
    const { x, moving } = motion
    let y = motion.y
    // Petit sursaut quand le « ! » apparaît.
    if (!heart && t >= think + 0.5 && t < think + 0.7) y += 1
    const facing = t < leave - 0.15 ? 1 : -1
    const center = Math.round(x)
    const local = (lx: number) => mirror(facing > 0 ? center - 5 + lx : center + 5 - lx)
    const sprite = (art: readonly string[], lx: number, ly: number) => {
      const w = art[0]!.length
      place(art, facing > 0 ? center - 5 + lx : center + 5 - lx - w + 1, y + ly, facing < 0)
    }

    let eyes: Eyes = moving || t > leave - 0.15 ? 'side' : 'front'
    let wave = -1
    let drop = -1
    if (gift) {
      if (t >= 2.3 && t < leave - 0.15) eyes = 'down'
      if (heart && t >= think + 0.65 && t < leave - 0.3) eyes = 'happy'
      drop = t < 2.3 ? 2 : t < 2.85 ? 2 - Math.round(smooth((t - 2.3) / 0.5) * 2) : -1
    } else {
      if (t >= 2.5 && t < 4.3) wave = Math.floor((t - 2.5) / 0.2) % 2
      if (t >= 2.7 && t < 4.6) eyes = 'happy'
      if ((t >= 2.32 && t < 2.44) || (t >= 5 && t < 5.12)) eyes = 'blink'
    }

    if (center > -9) {
      sprite(ROBOTS[body][eyes], 0, 0)
      // La boule de l'antenne respire doucement plutôt que de clignoter.
      paint.dot(local(5), y + 9, 'g', 0.65 + 0.35 * Math.cos(t * 3.2))
      if (wave >= 0) sprite(WAVES[body][wave]!, 10, 3)
      // Le bras descend le long du corps pour accompagner le cube jusqu'au sol.
      else if (drop >= 0) for (let h = 3; h > drop; h--) paint.dot(local(10), y + h, body)
      else {
        paint.dot(local(10), y + 3, body)
        paint.dot(local(10), y + 4, body)
      }
    }

    if (gift) {
      if (t < 2.85) place(CUBE, center + 6, drop + y, false)
      else place(CUBE, stop + 6, 0, false)
    }

    const fade = 1 - clamp((t - (think + 2.1)) / 0.35)
    if (t >= think && fade > 0) {
      paint.dot(mirror(rest - 3), 11, 'w', 0.4 * fade)
      if (t >= think + 0.25) paint.dot(mirror(rest - 5), 13, 'w', 0.4 * fade)
      if (t >= think + 0.5) {
        place(BUBBLE, rest - 15, 14, false, 0.3 * fade, ease((t - think - 0.5) / 0.3))
        const grow = ease((t - think - 0.65) / 0.25)
        if (heart) place(HEART, rest - 13, 16, false, fade, grow)
        else place(BANG, rest - 11, 16, false, fade, grow)
      }
    }
  },
}

export default robot
