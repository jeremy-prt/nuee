<script setup lang="ts">
import { computed, ref } from 'vue'

// Curseur à crans maison : les deux bouts de la piste sont le minimum et le maximum, la poignée s'y centre et
// déborde de sa demi-largeur (comme macOS), d'où la marge de 7 px qui la garde dans la grille du parent. Pendant
// un glisser elle suit le pointeur, puis se pose en glissant sur le cran le plus proche.
const props = defineProps<{
  label: string
  options: readonly { value: string; label: string }[]
  disabled?: boolean
}>()
const model = defineModel<string>()

const track = ref<HTMLElement>()
const index = computed(() => Math.max(0, props.options.findIndex((option) => option.value === model.value)))
const last = computed(() => Math.max(1, props.options.length - 1))
// Fraction suivie au pointeur pendant un glisser, sinon le cran choisi.
const dragged = ref<number | null>(null)
const ratio = computed(() => dragged.value ?? index.value / last.value)
const pressed = ref(false)
let startX = 0

const isRtl = () => !!track.value && getComputedStyle(track.value).direction === 'rtl'
const stop = (i: number) => `calc(100cqw * ${i / last.value})`

function fractionAt(clientX: number) {
  const box = track.value!.getBoundingClientRect()
  const x = isRtl() ? box.right - clientX : clientX - box.left
  return Math.min(1, Math.max(0, x / box.width))
}

function select(i: number) {
  const next = props.options[Math.min(props.options.length - 1, Math.max(0, i))]?.value
  if (next !== undefined && next !== model.value) model.value = next
}

function press(event: PointerEvent) {
  if (props.disabled || event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pressed.value = true
  startX = event.clientX
  select(Math.round(fractionAt(event.clientX) * last.value))
}

function move(event: PointerEvent) {
  if (!pressed.value) return
  if (dragged.value === null && Math.abs(event.clientX - startX) < 3) return
  dragged.value = fractionAt(event.clientX)
  select(Math.round(dragged.value * last.value))
}

function release() {
  pressed.value = false
  dragged.value = null
}

const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 }

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  let next: number
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last.value
  else if (event.key in steps) {
    const flip = isRtl() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    next = index.value + steps[event.key]! * (flip ? -1 : 1)
  } else return
  event.preventDefault()
  select(next)
}

const glide = computed(() =>
  dragged.value === null ? 'duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none' : 'transition-none',
)
</script>

<template>
  <div
    role="slider"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label"
    :aria-valuemin="0"
    :aria-valuemax="options.length - 1"
    :aria-valuenow="index"
    :aria-valuetext="options[index]?.label"
    :aria-disabled="disabled || undefined"
    class="group/slider flex h-5 touch-none items-center px-1.75 outline-none select-none aria-disabled:pointer-events-none aria-disabled:opacity-40"
    @pointerdown="press"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
    @keydown="onKeydown"
  >
    <span ref="track" class="relative h-1 w-full">
      <!-- Crans intermédiaires seulement : les bouts de la piste sont le premier et le dernier. Ceux du plein sont
           dans le plein, coupés à sa largeur : ils changent de teinte pile sous son bord. -->
      <span class="@container absolute inset-0 overflow-hidden rounded-full bg-content/12">
        <span v-for="i in last - 1" :key="i" class="absolute top-0 size-1 -ms-0.5 rounded-full bg-content/30" :style="{ insetInlineStart: stop(i) }" />
        <span class="absolute inset-y-0 start-0 overflow-hidden bg-accent transition-[width]" :class="glide" :style="{ width: `${ratio * 100}%` }">
          <span v-for="i in last - 1" :key="i" class="absolute top-0 size-1 -ms-0.5 rounded-full bg-canvas/35" :style="{ insetInlineStart: stop(i) }" />
        </span>
      </span>
      <span
        class="pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 -ms-1.75 rounded-full bg-content shadow-sm transition-[inset-inline-start,left,right,scale] group-hover/slider:scale-110 group-focus-visible/slider:outline-2 group-focus-visible/slider:outline-offset-2 group-focus-visible/slider:outline-ring"
        :class="[glide, { 'scale-115!': pressed }]"
        :style="{ insetInlineStart: `${ratio * 100}%` }"
        aria-hidden="true"
      />
    </span>
  </div>
</template>
