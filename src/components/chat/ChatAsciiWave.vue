<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { cssColor } from '@/composables/useEffects'

// Résumer en note activé : une onde de caractères part de la puce et traverse le cadre du champ, suivie d'un écho.
// Posée à côté du cadre flouté, pas dedans (WebKit cesse de flouter un calque animé). `x` et `y` dans le formulaire.
const props = defineProps<{ x: number; y: number }>()
const emit = defineEmits<{ done: [] }>()

const DURATION = 1200
const RAMP = ' .:-=+*#'
const CELL_W = 8
const CELL_H = 12

const canvas = useTemplateRef('canvas')
let frame = 0

const grow = (time: number) => 1 - (1 - Math.min(Math.max(time, 0) / 0.85, 1)) ** 3

onMounted(() => {
  const element = canvas.value!
  const box = element.getBoundingClientRect()
  const ratio = devicePixelRatio
  element.width = Math.round(box.width * ratio)
  element.height = Math.round(box.height * ratio)
  const context = element.getContext('2d')!
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'
  const tone = cssColor('--color-note')
  const reach = Math.hypot(Math.max(props.x, box.width - props.x), Math.max(props.y, box.height - props.y))
  const start = performance.now()
  const draw = (now: number) => {
    const t = (now - start) / DURATION
    context.clearRect(0, 0, box.width, box.height)
    if (t >= 1) return emit('done')
    const waves = [
      { radius: reach * 1.05 * grow(t), amp: (1 - t) ** 0.9 },
      { radius: reach * 0.85 * grow(t - 0.15), amp: t > 0.15 ? 0.6 * (1 - t) ** 0.9 : 0 },
    ]
    context.font = `600 11px ${font}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = tone
    for (let y = CELL_H / 2; y < box.height; y += CELL_H) {
      for (let x = CELL_W / 2; x < box.width; x += CELL_W) {
        const d = Math.hypot(x - props.x, y - props.y)
        let level = 0
        for (const wave of waves) level = Math.max(level, Math.exp(-(((d - wave.radius) / 22) ** 2)) * wave.amp)
        level = Math.min(level * 1.3, 1)
        const index = Math.floor(level * (RAMP.length - 1))
        if (index < 1) continue
        context.globalAlpha = 0.35 + 0.6 * level
        context.fillText(RAMP[index]!, x, y)
      }
    }
    context.globalAlpha = 1
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="mode-reveal z-1" :style="{ '--x': `${x}px`, '--y': `${y}px`, '--tone': 'var(--color-note)' }" aria-hidden="true" />
  <canvas ref="canvas" class="pointer-events-none absolute inset-0 z-1 size-full rounded-2xl" aria-hidden="true" />
</template>
