import type { Scene } from './types'

// Le lièvre et la tortue (d'après monocode) : le lièvre file, s'endort sous l'arbre, la tortue passe et gagne.
const TORTOISE = ['    ggggg     ', '  ggggggggg   ', ' ggggggggggg ww', 'ggggggggggggwkw', 'wwwwwwwwwwwww  ']
const TORTOISE_LEGS = [' w  w   w  w   ', '  w  w   w  w  ']
const HARE = ['         w w  ', '         w w  ', '        wwww  ', ' wwwwwwwwwkww ', 'wwwwwwwwwwww  ', ' wwwwwwwww    ']
const HARE_LEGS = [' w   w   w  w ', '  w w     ww  ']
const SLEEP = ['   wwwwww     ', ' wwwwwwwwwww  ', 'wwwwwwwwwwwww ', 'wwwwwwwwwwwwww']
const AWAKE = ['      w w ', '      w w ', '     wwww ', '     wwkw ', '   wwwww  ', ' wwwwwww  ', 'wwwwwwww  ', ' w   ww   ']
const TREE = ['   ggg   ', ' ggggggg ', 'ggggggggg', 'ggggggggg', ' ggggggg ', '   ggg   ', '    w    ', '    w    ', '    w    ', '    w    ']
const FLAG = ['wggggg', 'wggggg', 'wgggg ', 'w     ', 'w     ', 'w     ', 'w     ', 'w     ', 'w     ']
const FLAG_WAVE = ['wgggg ', 'wggggg', 'wggggg', 'w     ', 'w     ', 'w     ', 'w     ', 'w     ', 'w     ']
const BANG = ['g', 'g', 'g', ' ', 'g']
const ZED = ['ggg', ' g ', 'ggg']

type Painter = Parameters<Scene['draw']>[0]

const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const ease = (t: number) => 1 - (1 - clamp(t)) ** 3

const WALK = 0.4
const ARRIVE = 7.4
const RUN = 0.7
const STOP = 1.9
const NAP = 2.5
const RISE = 0.45
const LIFE = 1.3
const WAKE = ARRIVE + RISE + 0.05

// Une gerbe : la fusée monte du mât, éclate en anneau (un anneau intérieur plus lent), puis les points retombent en
// pluie. La traînée reprend la position un peu plus tôt : elle suit l'ouverture puis la chute.
function shell(paint: Painter, age: number, seed: number, from: number, cx: number, cy: number, radius: number, gold: boolean) {
  if (age < 0 || age > RISE + LIFE) return
  if (age < RISE) {
    for (let k = 0; k < 4; k++) {
      const p = 1 - (1 - Math.max(age / RISE - k * 0.04, 0)) ** 2
      paint.dot(from + (cx - from) * p, 10 + (cy - 10) * p, k ? 'g' : 'w', k ? 0.8 - k * 0.2 : 1)
    }
    return
  }
  const burst = age - RISE
  const life = burst / LIFE
  if (burst < 0.15) {
    const flash = 1 - burst / 0.15
    paint.dot(cx, cy, 'w', flash)
    paint.dot(cx - 1, cy, 'w', flash * 0.6)
    paint.dot(cx + 1, cy, 'w', flash * 0.6)
    paint.dot(cx, cy - 1, 'w', flash * 0.6)
    paint.dot(cx, cy + 1, 'w', flash * 0.6)
  }
  const count = gold ? 40 : 32
  const at = (a: number, speed: number, angle: number, out: 0 | 1) => {
    const d = speed * (1 - Math.exp(-5 * a))
    return out ? cy + Math.sin(angle) * d - 5 * a * a : cx + Math.cos(angle) * d
  }
  for (let i = 0; i < count; i++) {
    const inner = i % 4 === 0
    const angle = (i / count) * Math.PI * 2 + (paint.pick(seed + i) - 0.5) * 0.3
    const speed = radius * (inner ? 0.5 : 0.92 + paint.pick(seed + 60 + i) * 0.16)
    const twinkle = life > 0.3 ? 0.8 + 0.2 * Math.sin(burst * 15 + i * 2.1) : 1
    const alpha = (1 - life * life) * twinkle
    const bright = inner || i % 3 === 1
    const ink = bright === gold ? 'w' : 'g'
    paint.dot(at(burst, speed, angle, 0), at(burst, speed, angle, 1), ink, alpha)
    if (!inner && i % 2 && burst > 0.06) {
      const back = burst - 0.09
      paint.dot(at(back, speed, angle, 0), at(back, speed, angle, 1), 'g', alpha * 0.35)
    }
  }
}

const race: Scene = {
  name: 'race',
  duration: 10,
  draw(paint, t) {
    const tree = Math.round(paint.width * 0.6)
    const flag = Math.round(paint.width * 0.88)
    for (let i = 0; i < paint.width / 14; i++) paint.dot(Math.floor(paint.pick(i) * paint.width), 0, 'w', 0.25)

    paint.sprite(TREE, tree, 0, { reveal: ease(t / 0.5) })
    const waving = t > ARRIVE && Math.floor(t * 2.5) % 2 === 1
    paint.sprite(waving ? FLAG_WAVE : FLAG, flag, 0, { reveal: ease((t - 0.3) / 0.5) })

    // Lièvre : file depuis la gauche, se retourne vers la tortue, s'endort contre le tronc ; le feu d'artifice le réveille.
    const nap = tree - 10
    if (t > RUN && t < STOP) {
      const run = ease((t - RUN) / (STOP - RUN))
      const hop = Math.round(Math.abs(Math.sin(t * 20)) * 3 * (1 - run))
      const legs = run < 0.97 ? HARE_LEGS[Math.floor(t * 12) % 2]! : HARE_LEGS[0]!
      paint.sprite([...HARE, legs], -HARE[0]!.length + run * (nap + HARE[0]!.length), hop)
    } else if (t >= STOP && t < NAP) {
      paint.sprite([...HARE, HARE_LEGS[0]!], nap, 0, { flip: t > STOP + 0.15 })
    } else if (t >= NAP && t < WAKE) {
      paint.sprite(SLEEP, nap, 0)
      for (let k = 0; k < 2; k++) {
        const z = (t - NAP - 0.3 - k) / 2
        if (z < 0) continue
        const phase = z % 1
        const x = nap + 1 + phase * 4 + Math.sin(phase * 6 + k) * 0.8
        paint.sprite(ZED, x, SLEEP.length + 1 + phase * 12, { alpha: Math.min(phase * 5, 1) * (1 - phase) })
      }
    } else if (t >= WAKE) {
      const jump = t < WAKE + 0.3 ? Math.round(Math.sin(((t - WAKE) / 0.3) * Math.PI) * 2) : 0
      paint.sprite(AWAKE, nap + 1, jump)
      if (t < WAKE + 1.1) paint.sprite(BANG, nap + 8, AWAKE.length + 2 + jump, { alpha: Math.min((WAKE + 1.1 - t) / 0.3, 1) })
    }

    // Tortue : 7 s de marche régulière jusqu'au mât (15 pixels par seconde au plus), puis deux petits sauts de joie.
    // Dessinée après le lièvre pour rester lisible quand elle le dépasse.
    const walk = clamp((t - WALK) / (ARRIVE - WALK))
    const finish = flag - TORTOISE[0]!.length - 1
    const start = Math.max(paint.width * 0.03, finish - 105)
    const step = Math.floor(t * 5) % 2
    const joy = t > ARRIVE + 0.05 && t < ARRIVE + 0.65 ? Math.round(Math.abs(Math.sin((t - ARRIVE - 0.05) * Math.PI * 3.33))) : 0
    paint.sprite([...TORTOISE, TORTOISE_LEGS[walk < 1 ? step : 0]!], start + walk * (finish - start), joy, {
      alpha: Math.min(t / 0.4, 1),
    })

    // Arrivée : deux gerbes qui montent du mât, une grande au-dessus et une plus petite à sa gauche, dans un ordre tiré.
    const swap = paint.pick(200) < 0.5
    const big = Math.min(12 + paint.pick(201) * 2, (paint.height - 18) / 2.3)
    const small = big * 0.75
    const right = Math.min(flag + 2, paint.width - 2 - big * 1.15)
    const left = right - (big + small) * 1.1 - paint.pick(202) * 3
    const high = paint.height - 3 - big * 1.15
    const low = high - 2 - paint.pick(203) * 4
    shell(paint, t - ARRIVE, 300, flag, swap ? left : right, swap ? low : high, swap ? small : big, !swap)
    shell(paint, t - ARRIVE - 0.4, 400, flag, swap ? right : left, swap ? high : low, swap ? big : small, swap)
  },
}

export default race
