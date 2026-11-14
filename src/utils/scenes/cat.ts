import type { Scene } from './types'

// Un chat arrive, s'assoit et suit un papillon des yeux ; selon les fois, il saute après lui ou le laisse se poser
// sur sa tête, puis repart derrière lui. Dessins tournés vers la droite, retournés quand le chat vient de la droite.
const BODY = ['         w  w', 'w        wwww', ' w       wwkw', ' wwwwwwwwwww ', '  wwwwwwwww  ']
const WALK = [
  [...BODY, '  w  w  w  w '],
  [...BODY, '   ww    ww  '],
]
const SIT = ['    w  w', '    wwww', '    wwkw', '    www ', '   wwww ', '  wwwww ', ' wwwwww ', ' wwwwww ', ' wwwwww ']
const SIT_UP = ['    w  w', '    wwkw', '    wwww', ...SIT.slice(3)]
const TAIL_DOWN = ['   ', '   ', 'www']
const TAIL_MID = ['   ', 'w  ', ' ww']
const TAIL = [TAIL_DOWN, TAIL_MID, ['w  ', 'w  ', ' ww'], TAIL_MID]
const LEAP = [
  '            w  w ',
  '            wwww ',
  'ww          wwkw ',
  '  wwwwwwwwwwwww  ',
  '   wwwwwwwwww  ww',
  ' ww              ',
]
const BUTTERFLY = [
  ['p p', ' p '],
  [' p ', 'p p'],
]
const CLOSED = [' p ', ' p ']

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const ease = (t: number) => 1 - (1 - clamp(t)) ** 3
const smooth = (t: number) => clamp(t) * clamp(t) * (3 - 2 * clamp(t))

const cat: Scene = {
  name: 'cat',
  duration: 8,
  draw(paint, t) {
    const left = paint.pick(0) < 0.5
    const leaps = paint.pick(1) < 0.55
    const put = (art: readonly string[], x: number, y: number) =>
      paint.sprite(art, left ? paint.width - x - art[0]!.length : x, y, { flip: left })

    for (let i = 0; i < paint.width / 14; i++) paint.dot(Math.floor(paint.pick(10 + i) * paint.width), 0, 'w', 0.25)

    const stop = Math.round(paint.width * (0.26 + paint.pick(2) * 0.1))
    const sitX = stop + 5
    const leapEnd = leaps ? 10 : 0
    const restX = sitX + leapEnd

    // Papillon : arrive du côté opposé en ondulant, tourne devant le chat, se pose ou non, puis file devant lui.
    const settle = leaps ? 4.8 : 4.2
    const turn = (Math.min(t, settle) - 2.4) * 2.2
    const wobble = Math.sin(t * 7) * 0.5
    let bx = sitX + 12 + 6 * Math.cos(turn)
    let by = 12 + 3 * Math.sin(2 * turn)
    let wings = BUTTERFLY[Math.floor(t * 7) % 2]!
    if (t < 2.4) {
      const p = smooth((t - 0.3) / 2.1)
      bx = paint.width + 4 + (bx - paint.width - 4) * p
      by = 16 + (by - 16) * p + Math.sin(t * 5) * 1.5 * (1 - p)
    } else if (!leaps) {
      const land = smooth((t - 4.2) / 0.8)
      bx += (sitX + 4 - bx) * land
      by += (SIT.length - by) * land
      if (land === 1 && t < 6) wings = Math.floor(t * 1.5) % 2 ? CLOSED : BUTTERFLY[0]!
    }
    const leave = leaps ? 4.8 : 6
    const rise = ease((t - leave) / 0.6)
    const high = by > 12 || (!leaps && t > 4.9 && t < leave + 0.2)
    bx += Math.max(t - leave - 0.15, 0) ** 1.4 * paint.width * 0.25
    by += (17 - by) * rise + wobble * (wings === CLOSED || (t > 5 && t < leave) ? 0 : 1)
    if (t > 0.3 && bx < paint.width + 1) put(wings, bx, wings === BUTTERFLY[1] ? by - 1 : by)

    // Chat : marche (pattes selon la distance parcourue), s'assoit, regarde, saute ou non, repart.
    const walk = (x: number) => put(WALK[Math.floor(x / 4) & 1]!, x, 0)
    const sit = (x: number) => {
      put(high ? SIT_UP : SIT, x, 0)
      put(TAIL[Math.floor(t * 4) % 4]!, x - 2, 0)
    }
    if (t < 2) walk(-13 + (1 - (1 - t / 2) ** 2) * (stop + 13))
    else if (t >= 6.2) {
      const p = (t - 6.2) / 1.8
      walk(restX - 5 + ((p * (1 + p)) / 2) * (paint.width + 8 - restX))
    } else if (!leaps || t < 4.55) sit(sitX)
    else if (t < 4.85) put(BODY, stop, 0)
    else if (t < 5.45) {
      const p = (t - 4.85) / 0.6
      put(LEAP, stop + p * leapEnd, Math.sin(Math.PI * p) * 8)
    } else sit(restX)
  },
}

export default cat
