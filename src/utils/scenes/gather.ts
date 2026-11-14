import type { Scene } from './types'

// Rassemblement : des points épars dérivent, convergent en un petit dessin net (étoile, cœur, planète ou « hi »),
// qui brille un instant puis se défait en poussière qui s'envole.
const STAR = [
  '        w        ',
  '       ggg       ',
  '       wgg       ',
  '      gwggg      ',
  '      ggggg      ',
  'wgggggggggggggggw',
  ' ggggggggggggggg ',
  '  ggggggggggggg  ',
  '   ggggggggggg   ',
  '    ggggggggg    ',
  '    ggggggggg    ',
  '   ggggg ggggg   ',
  '   gggg   gggg   ',
  '  gggg     gggg  ',
  '  ggg       ggg  ',
  ' wg           gw ',
]
const HEART = [
  '   ggg   ggg   ',
  '  gwwgg ggggg  ',
  ' gwggggggggggg ',
  'gwggggggggggggo',
  'ggggggggggggggo',
  'ggggggggggggggo',
  ' ggggggggggggo ',
  '  ggggggggggo  ',
  '   ggggggggo   ',
  '    ggggggo    ',
  '     ggggo     ',
  '      ggo      ',
  '       o       ',
]
const PLANET = [
  '        wwwbb        ',
  '       wwbbbbb       ',
  '      wbbbbbbbbggggg ',
  '     wbbbbbbbbbb    g',
  '     bbbbbbbbbbb    g',
  '   ggbbbbbbbbbbv  gg ',
  ' gg  bbbbbbbbbvggg   ',
  'g    bbbbbbbgggv     ',
  'g     ggggggvvv      ',
  ' ggggg bbbvvvv       ',
  '        bvvvv        ',
]
const HI = [
  'www       www ',
  'wwwg      wwwg',
  'wwwg       ggg',
  'wwwg          ',
  'wwwwwww   www ',
  'wwwwwwww  wwwg',
  'wwwggwwwg wwwg',
  'wwwg wwwg wwwg',
  'wwwg wwwg wwwg',
  'wwwg wwwg wwwg',
  'wwwg wwwg wwwg',
  'wwwg wwwg wwwg',
  ' ggg  ggg  ggg',
]

type Painter = Parameters<Scene['draw']>[0]
type Ink = Parameters<Painter['dot']>[2]

interface Grain {
  x: number
  y: number
  ink: Ink
  // Hauteur dans le dessin, de 0 (bas) à 1 (haut) : le haut part en premier.
  level: number
}

// Chaque dessin devient une liste de grains centrée sur (0, 0), une fois pour toutes.
const SHAPES = [STAR, HEART, PLANET, HI].map((art) => {
  const grains: Grain[] = []
  const width = Math.max(...art.map((line) => line.length))
  art.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const ink = line[col]!
      if (ink === ' ') continue
      const y = art.length - 1 - row
      grains.push({ x: col - Math.floor(width / 2), y: y - Math.floor(art.length / 2), ink: ink as Ink, level: y / (art.length - 1) })
    }
  })
  // Les éclats se posent sur un grain coloré : sur du blanc, une croix blanche ne se verrait pas.
  const matte = grains.filter((grain) => grain.ink !== 'w')
  return { grains, matte, reach: Math.max(width, art.length) / 2 }
})
const HALO: Ink[] = ['b', 'v', 'w', 'b', 'g', 'v', 'w', 'b', 'v', 'g', 'w', 'b', 'v', 'w']

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const bell = (t: number) => (t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0)

const GATHER = 1.4
const SHINE = 4.1
const RELEASE = 5.1
const FLIGHT = 1.3

function put(paint: Painter, x: number, y: number, ink: Ink, alpha: number) {
  const col = Math.round(x)
  const row = Math.round(y)
  if (alpha < 0.02 || col < 0 || row < 0 || col >= paint.width || row >= paint.height) return
  paint.dot(col, row, ink, Math.min(alpha, 1))
}

const gather: Scene = {
  name: 'gather',
  duration: 7.2,
  draw(paint, t) {
    const shape = SHAPES[Math.floor(paint.pick(0) * SHAPES.length)]!
    const swirl = paint.pick(1) < 0.5 ? 1 : -1
    const cx = Math.round(paint.width / 2)
    const cy = Math.round(paint.height / 2)

    // Reflet : une bande diagonale qui traverse le dessin une fois, en blanc par-dessus.
    const sweep = clamp((t - SHINE) / 0.75)
    const band = -shape.reach * 1.6 + sweep * shape.reach * 3.2

    const grains = shape.grains
    for (let i = 0; i < grains.length + HALO.length; i++) {
      const grain = grains[i]
      const seed = 100 + i * 6
      const hx = 3 + paint.pick(seed) * (paint.width - 7)
      const hy = 3 + paint.pick(seed + 1) * (paint.height - 7)
      const phase = paint.pick(seed + 2) * 6.28
      const ink = grain ? grain.ink : HALO[i - grains.length]!

      const sx = hx + Math.sin(t * 0.7 + phase) * 2.2
      const sy = hy + Math.cos(t * 0.55 + phase * 1.3) * 1.6
      const rest = (0.45 + paint.pick(seed + 3) * 0.35) * (0.85 + 0.15 * Math.sin(t * 2 + phase))

      // Le halo ne rejoint pas le dessin : il tourne lentement autour, en retrait.
      let tx: number
      let ty: number
      if (grain) {
        tx = cx + grain.x
        ty = cy + grain.y
      } else {
        const angle = phase + t * 0.25 * swirl
        const radius = shape.reach + 4 + paint.pick(seed + 4) * 6
        tx = cx + Math.cos(angle) * radius * 1.5
        ty = cy + Math.sin(angle) * radius * 0.8
      }

      // Trajet courbe : point de contrôle décalé sur le côté, même sens pour tous, ce qui donne un tourbillon.
      const begin = GATHER + paint.pick(seed + 4) * 0.6
      const e = easeInOut(clamp((t - begin) / (1.7 + paint.pick(seed + 5) * 0.3)))
      const bend = swirl * (0.25 + paint.pick(seed + 2) * 0.15)
      const mx = (sx + tx) / 2 - (ty - sy) * bend
      const my = (sy + ty) / 2 + (tx - sx) * bend
      let x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * tx
      let y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ty
      const settled = grain ? 1 : 0.45
      let alpha = rest + (settled - rest) * e
      alpha *= clamp((t - paint.pick(seed + 3) * 0.5) / 0.4)
      if (grain && e >= 1 && t < RELEASE) alpha *= 0.92 + 0.08 * Math.sin(t * 5 + phase)

      const leave = RELEASE + (grain ? (1 - grain.level) * 0.5 : 0.2) + paint.pick(seed + 5) * 0.35
      const age = t - leave
      if (age > 0) {
        if (age > FLIGHT) continue
        x += Math.sin(age * 3 + phase) * 1.4 * age + (paint.pick(seed) - 0.5) * 5 * age
        y += age * 4 + age * age * 8
        alpha *= 1 - (age / FLIGHT) ** 1.5
      }
      put(paint, x, y, ink, alpha)

      if (grain && sweep > 0 && sweep < 1 && age <= 0 && ink !== 'w') {
        const glow = Math.exp(-(((grain.x + grain.y * 0.7 - band) / 1.4) ** 2))
        if (glow > 0.1) put(paint, x, y, 'w', glow * 0.8)
      }
    }

    for (let k = 0; k < 3; k++) {
      const glint = bell((t - SHINE - 0.1 - k * 0.3) / 0.55)
      if (!glint) continue
      const grain = shape.matte[Math.floor(paint.pick(20 + k) * shape.matte.length)]!
      const gx = cx + grain.x
      const gy = cy + grain.y
      put(paint, gx, gy, 'w', glint)
      for (let arm = 1; arm <= 2; arm++) {
        const fade = glint * (arm === 1 ? 0.6 : 0.25)
        put(paint, gx + arm, gy, 'w', fade)
        put(paint, gx - arm, gy, 'w', fade)
        put(paint, gx, gy + arm, 'w', fade)
        put(paint, gx, gy - arm, 'w', fade)
      }
    }
  },
}

export default gather
