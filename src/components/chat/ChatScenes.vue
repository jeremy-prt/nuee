<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { cssColor } from '@/composables/useEffects'
import { useAppearanceStore } from '@/stores/appearance'
import { DEFAULT_PACE, PACE, scenes } from '@/utils/scenes'
import type { Ink, Painter, Scene } from '@/utils/scenes/types'

// Bande du bas de la session vierge : une petite scène tirée au hasard (jamais deux fois la même d'affilée) passe de
// temps en temps. La page est vue moins de 15 s en général : la première vient vite, les suivantes s'espacent. Rien
// ne tourne entre deux scènes ; `active` à faux (session commencée) fond la bande et reporte la suivante.
const props = defineProps<{ active: boolean }>()

const PIXEL = 2
// Haute de 48 pixels : les scènes posées au sol n'en prennent que le bas, les autres (ciel, constellations) montent.
const HEIGHT = 96
const FIRST: [number, number] = [6, 12]
const NEXT: [number, number] = [35, 70]
const FADE_IN = 0.25
const FADE_OUT = 0.4
// Largeur du fondu aux bords de la bande, en pixels de scène (2 px chacun).
const EDGE = 14
const INKS: Record<Ink, string> = {
  g: '--color-note',
  w: '--color-content',
  k: '--color-canvas',
  b: '--color-mention',
  v: '--color-violet',
  p: '--color-skill',
  o: '--color-orange',
  s: '--color-success',
  r: '--color-danger',
  m: '--color-muted',
}

const appearance = useAppearanceStore()
const canvas = useTemplateRef('canvas')
let context: CanvasRenderingContext2D | null = null
let palette = {} as Record<Ink, string>
let timer: ReturnType<typeof setTimeout> | undefined
let frame = 0
let lastScene: Scene | null = null

function readColors() {
  palette = Object.fromEntries(Object.entries(INKS).map(([ink, name]) => [ink, cssColor(name)])) as Record<Ink, string>
}

const between = ([low, high]: [number, number]) => (low + Math.random() * (high - low)) * 1000

function schedule(delay: number) {
  clearTimeout(timer)
  timer = setTimeout(play, delay)
}

function play(name?: string) {
  if (!props.active || document.hidden || !context || !canvas.value?.checkVisibility?.({ visibilityProperty: true })) {
    return schedule(between([8, 15]))
  }
  const choices = name ? scenes.filter((scene) => scene.name === name) : scenes.filter((scene) => scene !== lastScene || scenes.length === 1)
  const scene = choices[Math.floor(Math.random() * choices.length)]
  if (!scene) return
  lastScene = scene
  run(scene)
}

function run(scene: Scene) {
  const element = canvas.value!
  const width = element.getBoundingClientRect().width
  const ratio = devicePixelRatio
  element.width = Math.round(width * ratio)
  element.height = Math.round(HEIGHT * ratio)
  const draw = context!
  draw.setTransform(ratio, 0, 0, ratio, 0, 0)
  const seeds = new Map<number, number>()
  let fade = 1
  const columns = Math.floor(width / PIXEL)
  const rows = Math.floor(HEIGHT / PIXEL)
  // Ce qui entre ou sort par un côté ou par le haut s'efface en approchant du bord, au lieu d'être coupé net.
  const edge = (px: number, py: number) => Math.min(Math.max(Math.min(px, columns - 1 - px, rows - 1 - py) / EDGE, 0), 1)
  const pixel = (px: number, py: number, alpha: number) => {
    const opacity = alpha * fade * edge(px, py)
    if (opacity <= 0.01) return
    draw.globalAlpha = opacity
    draw.fillRect(px * PIXEL, HEIGHT - (py + 1) * PIXEL, PIXEL, PIXEL)
  }
  const painter: Painter = {
    width: columns,
    height: rows,
    dot(x, y, ink, alpha = 1) {
      draw.fillStyle = palette[ink]
      pixel(Math.round(x), Math.round(y), alpha)
    },
    sprite(art, x, y, options = {}) {
      const shown = Math.ceil(art.length * Math.min(Math.max(options.reveal ?? 1, 0), 1))
      const alpha = options.alpha ?? 1
      const left = Math.round(x)
      const bottom = Math.round(y)
      for (let row = art.length - shown; row < art.length; row++) {
        const line = art[row]!
        for (let col = 0; col < line.length; col++) {
          const ink = line[options.flip ? line.length - 1 - col : col] as Ink | ' '
          if (ink === ' ' || !palette[ink]) continue
          draw.fillStyle = palette[ink]
          pixel(left + col, bottom + art.length - 1 - row, alpha)
        }
      }
    },
    pick(index) {
      let value = seeds.get(index)
      if (value === undefined) seeds.set(index, (value = Math.random()))
      return value
    },
  }
  const pace = PACE[scene.name] ?? DEFAULT_PACE
  const duration = scene.duration / pace
  const start = performance.now()
  const tick = (now: number) => {
    const t = (now - start) / 1000
    draw.clearRect(0, 0, width, HEIGHT)
    if (t >= duration) {
      frame = 0
      return schedule(between(NEXT))
    }
    fade = Math.min(t / FADE_IN, (duration - t) / FADE_OUT, 1)
    scene.draw(painter, t * pace)
    draw.globalAlpha = 1
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

watch(
  () => props.active,
  (active) => {
    if (active && !frame) schedule(between(FIRST))
  },
)

watch(() => [appearance.resolvedMode, appearance.accent, appearance.theme], readColors)

onMounted(() => {
  context = canvas.value!.getContext('2d')
  readColors()
  if (props.active) schedule(between(FIRST))
  // Pour essayer une scène sans attendre, en dev : `__nueeScene('race')` dans la console.
  if (import.meta.env.DEV) Object.assign(window, { __nueeScene: (name?: string) => play(name) })
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <canvas
    ref="canvas"
    class="pointer-events-none transition-opacity duration-450 ease-out"
    :class="active ? 'opacity-100' : 'opacity-0'"
    :style="{ height: `${HEIGHT}px`, imageRendering: 'pixelated' }"
    aria-hidden="true"
  />
</template>
