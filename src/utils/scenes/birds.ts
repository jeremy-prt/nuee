import type { Scene } from './types'

// Un petit vol d'oiseaux traverse la bande en ondulant : battements en montée, plané en descente, comme les passereaux.
// Les plus petits, plus pâles, sont plus loin. Dessins symétriques, le corps sur la rangée du bas (DOWN : du haut).
const BIG = {
  up: ['w   w', ' w w ', '  w  '],
  mid: ['ww ww', '  w  '],
  down: ['  w  ', ' w w ', 'w   w'],
}
const SMALL = {
  up: ['w w', ' w '],
  mid: ['www'],
  down: [' w ', 'w w'],
}

const cycle = ['up', 'mid', 'down', 'mid'] as const

const birds: Scene = {
  name: 'birds',
  duration: 7,
  draw(paint, t) {
    const left = paint.pick(0) < 0.5
    const count = 3 + Math.floor(paint.pick(1) * 3)
    const altitude = 9 + paint.pick(2) * 4
    const climb = (paint.pick(3) - 0.5) * 4
    const lead = -6 + (t / 6.6) * (paint.width + 52)
    // Une fois sur deux, le dernier part en retard et rattrape les autres en battant sans relâche.
    const late = paint.pick(4) < 0.5 ? count - 1 : -1

    for (let i = 0; i < count; i++) {
      const far = i > 0 && paint.pick(20 + i) < 0.4
      const look = far ? SMALL : BIG
      // V lâche : chacun en retrait, alterné dessus et dessous, et qui flotte autour de sa place.
      const side = i % 2 ? 1 : -1
      const catchUp = i === late ? 16 * (1 - Math.min(t / 5, 1)) ** 2 : 0
      const back = i * (7 + paint.pick(30 + i) * 4) + Math.sin(t * 0.9 + i * 2) * 1.5 + catchUp
      const rank = Math.ceil(i / 2) * (2 + paint.pick(40 + i) * 1.5) * side
      const phase = paint.pick(50 + i) * Math.PI * 2
      const speed = 2.2 + paint.pick(60 + i) * 0.8
      const wave = Math.sin(t * speed + phase)
      const rising = catchUp > 1 || Math.cos(t * speed + phase) > -0.2
      const x = lead - back
      const y = altitude + rank + climb * (t / 7) + wave * 1.6
      const pose = rising ? cycle[Math.floor(t * 9 + phase * 2) % 4]! : 'mid'
      const art = look[pose]
      const px = left ? paint.width - x - art[0]!.length : x
      if (px < -6 || px > paint.width + 1) continue
      paint.sprite(art, px, pose === 'down' ? y - art.length + 1 : y, { alpha: far ? 0.55 : 1 })
    }
  },
}

export default birds
