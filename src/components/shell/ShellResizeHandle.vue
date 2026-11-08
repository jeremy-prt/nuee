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
  // Sans ça, tirer la poignée étend une sélection de texte dans la conversation voisine.
  event.preventDefault()
  window.getSelection()?.removeAllRanges()
  const handle = event.currentTarget as HTMLElement
  const axis = props.orientation === 'vertical' ? 'clientX' : 'clientY'
  const start = event[axis]
  const startSize = size.value
  handle.setPointerCapture(event.pointerId)
  document.documentElement.style.userSelect = 'none'

  const onMove = (move: PointerEvent) => {
    const delta = move[axis] - start
    size.value = clamp(startSize + (props.invert ? -delta : delta))
  }
  handle.addEventListener('pointermove', onMove)
  // Relâchée ou interrompue (Échap, perte de focus) : la sélection revient toujours.
  handle.addEventListener(
    'lostpointercapture',
    () => {
      handle.removeEventListener('pointermove', onMove)
      document.documentElement.style.userSelect = ''
    },
    { once: true },
  )
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
    class="relative z-10 shrink-0 outline-none"
    :class="[
      'separator hover:bg-edge-hover hover:bg-none active:bg-edge-hover active:bg-none focus-visible:bg-ring focus-visible:bg-none focus-visible:shadow-[0_0_0_1px_var(--color-ring)]',
      // Allumée, la poignée fait 2 px : le trait plus un pixel à sa droite (ou dessous), que la barre de titre reprend.
      orientation === 'vertical'
        ? 'w-px hover:shadow-[1px_0_0_0_var(--color-edge-hover)] active:shadow-[1px_0_0_0_var(--color-edge-hover)] focus-visible:shadow-[1px_0_0_0_var(--color-ring)]'
        : 'h-px hover:shadow-[0_1px_0_0_var(--color-edge-hover)] active:shadow-[0_1px_0_0_var(--color-edge-hover)] focus-visible:shadow-[0_1px_0_0_var(--color-ring)]',
    ]"
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
