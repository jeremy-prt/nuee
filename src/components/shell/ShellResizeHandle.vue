<script setup lang="ts">
const size = defineModel<number>({ required: true })
const props = defineProps<{
  orientation: 'vertical' | 'horizontal'
  min: number
  max: number
  defaultSize: number
  label: string
  // Panneau placé après la poignée (droite ou bas) : il grandit quand on tire vers le début.
  invert?: boolean
}>()

const KEYBOARD_STEP = 16

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, Math.round(value)))
}

function onPointerDown(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  const axis = props.orientation === 'vertical' ? 'clientX' : 'clientY'
  const start = event[axis]
  const startSize = size.value
  handle.setPointerCapture(event.pointerId)

  const onMove = (move: PointerEvent) => {
    const delta = move[axis] - start
    size.value = clamp(startSize + (props.invert ? -delta : delta))
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', onMove), { once: true })
}

function onKeydown(event: KeyboardEvent) {
  const forward = props.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
  const backward = props.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
  if (event.key !== forward && event.key !== backward) return
  event.preventDefault()
  const direction = (event.key === forward ? 1 : -1) * (props.invert ? -1 : 1)
  size.value = clamp(size.value + direction * KEYBOARD_STEP)
}
</script>

<template>
  <div
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    :aria-label="label"
    :aria-valuenow="size"
    :aria-valuemin="min"
    :aria-valuemax="max"
    class="separator relative z-10 shrink-0 outline-none hover:bg-ring focus-visible:bg-ring"
    :class="orientation === 'vertical' ? 'w-px' : 'h-px'"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
    @dblclick="size = defaultSize"
  >
    <span
      class="absolute"
      :class="orientation === 'vertical' ? '-inset-x-1.5 inset-y-0 cursor-col-resize' : '-inset-y-1.5 inset-x-0 cursor-row-resize'"
      aria-hidden="true"
    />
  </div>
</template>
