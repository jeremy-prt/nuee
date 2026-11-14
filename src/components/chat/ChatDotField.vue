<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { cssColor } from '@/composables/useEffects'
import { useAppearanceStore } from '@/stores/appearance'
import { DotField } from '@/utils/dotField'

// Fond étoilé, posé par WorkspacePane sous la session affichée : `visible` (session vierge) le fait apparaître et
// disparaître en fondu d'une session à l'autre, puis la boucle s'arrête. 20 images par seconde pour les étoiles, 30
// quand le pointeur ou une onde l'allument ; rien fenêtre cachée ni vue mise de côté (`view-parked`). `enabled` à faux
// (texte en cours de saisie) : plus de geste ni d'étoile filante, les étoiles restent.
const props = defineProps<{ visible: boolean; enabled: boolean }>()

const FADE_MS = 450
const appearance = useAppearanceStore()
const canvas = useTemplateRef('canvas')
const field = new DotField()
const shownOpacity = ref(0)
let context: CanvasRenderingContext2D | null = null
let colors: string[] = []
let alphas: number[] = []
let starAlpha = 1
let frame = 0
let last = 0
let onScreen = true
let checked = 0
let running = false
let retry: ReturnType<typeof setTimeout> | undefined
let sleep: ReturnType<typeof setTimeout> | undefined
let host: HTMLElement | null = null
let resize: ResizeObserver | null = null

function readColors() {
  colors = ['--color-mention', '--color-violet', '--color-skill', '--color-content'].map(cssColor)
  const light = appearance.resolvedMode === 'light'
  // Sur fond clair, des points sombres de 2 px ressortent moins que des points clairs sur fond sombre.
  alphas = [0.12, 0.28, 0.3].map((alpha) => alpha * (light ? 1.3 : 1))
  // En sombre, des étoiles grises plutôt que blanches : elles ressortent moins.
  starAlpha = light ? 1 : 0.55
}

function tick(now: number) {
  frame = 0
  if (!context || !running || document.hidden) return
  if (now - checked > 500) {
    checked = now
    onScreen = canvas.value?.checkVisibility?.({ visibilityProperty: true }) ?? true
    if (onScreen) field.avoid(zones())
  }
  if (!onScreen) {
    last = 0
    retry = setTimeout(wake, 1000)
    return
  }
  const interval = 1000 / (field.busy() ? 30 : 20)
  if (last && now - last < interval - 2) {
    frame = requestAnimationFrame(tick)
    return
  }
  field.step(last ? Math.min((now - last) / 1000, 0.05) : 0, props.enabled)
  last = now
  field.paint(context, colors, alphas, starAlpha)
  frame = requestAnimationFrame(tick)
}

// Champ de saisie et titre de la session affichée, en coordonnées du canvas, élargis de 20 px.
function zones() {
  const box = canvas.value?.getBoundingClientRect()
  if (!box || !host) return []
  return [...host.querySelectorAll('[data-composer], [data-chat-pane] h1')].map((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left - box.left - 20, top: rect.top - box.top - 20, right: rect.right - box.left + 20, bottom: rect.bottom - box.top + 20 }
  })
}

function wake() {
  clearTimeout(retry)
  checked = 0
  if (running && !frame) frame = requestAnimationFrame(tick)
}

watch(
  () => props.visible,
  (visible) => {
    clearTimeout(sleep)
    if (visible) {
      running = true
      shownOpacity.value = 1
      wake()
    } else {
      shownOpacity.value = 0
      field.left()
      // La boucle s'arrête une fois le fondu fini.
      sleep = setTimeout(() => {
        running = false
        cancelAnimationFrame(frame)
        frame = 0
        last = 0
      }, FADE_MS)
    }
  },
)

function local(event: PointerEvent) {
  const box = canvas.value!.getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

function onMove(event: PointerEvent) {
  if (!props.visible || !props.enabled) return
  const { x, y } = local(event)
  field.moved(x, y, performance.now())
  wake()
}

// Bouton tenu seulement dans le vide : ni sur un bouton, un menu ou le champ.
function onDown(event: PointerEvent) {
  if (!props.visible || !props.enabled || event.button !== 0) return
  if ((event.target as Element).closest('button, a, input, textarea, select, label, form, [role], [contenteditable]')) return
  const { x, y } = local(event)
  field.pressed(x, y)
  wake()
}

function onUp() {
  field.released()
  wake()
}

function onLeave() {
  field.left()
}

onMounted(() => {
  const element = canvas.value!
  host = element.parentElement!
  context = element.getContext('2d')
  readColors()
  resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry!.contentRect
    const ratio = devicePixelRatio
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
    context?.setTransform(ratio, 0, 0, ratio, 0, 0)
    field.resize(width, height)
    field.avoid(zones())
    if (running && context) field.paint(context, colors, alphas, starAlpha)
  })
  resize.observe(element)
  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerdown', onDown)
  host.addEventListener('pointerleave', onLeave)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('blur', onLeave)
  document.addEventListener('visibilitychange', wake)
  if (props.visible) {
    running = true
    // Une image plus tard, pour que le fondu d'entrée parte de 0.
    requestAnimationFrame(() => (shownOpacity.value = 1))
    wake()
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(retry)
  clearTimeout(sleep)
  resize?.disconnect()
  host?.removeEventListener('pointermove', onMove)
  host?.removeEventListener('pointerdown', onDown)
  host?.removeEventListener('pointerleave', onLeave)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('blur', onLeave)
  document.removeEventListener('visibilitychange', wake)
})

watch(() => [appearance.resolvedMode, appearance.accent, appearance.theme], readColors)
watch(
  () => props.enabled,
  (on) => {
    if (!on) field.left()
  },
)
</script>

<template>
  <canvas
    ref="canvas"
    class="transition-opacity ease-out"
    :style="{ opacity: shownOpacity, transitionDuration: `${FADE_MS}ms` }"
    aria-hidden="true"
  />
</template>
