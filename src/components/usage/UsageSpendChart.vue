<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementWidth } from '@/composables/useElementWidth'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { Column, ModelRow } from '@/utils/usage'

// Coût ou tokens par jour (par heure sur une journée), empilés par modèle ; le survol d'une colonne en donne le détail.
const props = defineProps<{ columns: Column[]; models: ModelRow[]; hourly: boolean; label: string; format: (value: number) => string; axis: (value: number) => string }>()

const { formats } = useUsageFormat()
const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const hovered = ref<number | null>(null)

const HEIGHT = 220
const PAD = { top: 8, end: 0, bottom: 22, start: 52 }

const plot = computed(() => ({ width: Math.max(0, width.value - PAD.start - PAD.end), height: HEIGHT - PAD.top - PAD.bottom }))

// Haut de l'échelle arrondi à 1, 2 ou 5 × 10ⁿ pour des graduations lisibles.
const top = computed(() => {
  const max = Math.max(...props.columns.map((column) => column.total), 0)
  if (max <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  return ([1, 2, 5, 10].find((step) => step * power >= max) ?? 10) * power
})
const y = (value: number) => PAD.top + (1 - value / top.value) * plot.value.height

const slot = computed(() => plot.value.width / Math.max(1, props.columns.length))
const bar = computed(() => Math.max(2, Math.min(32, slot.value * 0.66)))

const bars = computed(() =>
  props.columns.map((column, index) => {
    let base = 0
    const center = PAD.start + slot.value * (index + 0.5)
    const segments = column.values.flatMap((value, model) => {
      if (value <= 0) return []
      const segment = { y: y(base + value), height: y(base) - y(base + value), color: props.models[model]?.color ?? '' }
      base += value
      return [segment]
    })
    return { x: center - bar.value / 2, center, segments }
  }),
)

const tick = (at: number) => (props.hourly ? formats.value.hour.format(at) : formats.value.day.format(at))
const ticks = computed(() => {
  const every = Math.max(1, Math.ceil(60 / slot.value))
  return props.columns.flatMap((column, index) => (index % every === 0 ? [{ at: column.start, x: bars.value[index]!.center }] : []))
})

const detail = computed(() => {
  const index = hovered.value
  const column = index === null ? null : props.columns[index]
  if (!column || index === null) return null
  const title = props.hourly ? `${formats.value.time.format(column.start)} – ${formats.value.time.format(column.end)}` : formats.value.dayLong.format(column.start)
  const rows = props.models.flatMap((model, at) => (column.values[at]! > 0 ? [{ ...model, value: column.values[at]! }] : []))
  const left = Math.min(Math.max(0, bars.value[index]!.center + 12), Math.max(0, width.value - 200))
  return { title, rows, column, left }
})

function onMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const index = Math.floor((event.clientX - rect.left - PAD.start) / slot.value)
  hovered.value = index >= 0 && index < props.columns.length ? index : null
}
</script>

<template>
  <div ref="box" class="relative">
    <svg v-if="width" :width="width" :height="HEIGHT" class="block" role="img" :aria-label="label" @pointermove="onMove" @pointerleave="hovered = null">
      <g class="text-[10px] tabular-nums" aria-hidden="true">
        <template v-for="level in [0, 0.5, 1]" :key="level">
          <line :x1="PAD.start" :x2="PAD.start + plot.width" :y1="y(top * level)" :y2="y(top * level)" class="stroke-content/8" />
          <text :x="PAD.start - 10" :y="y(top * level) + 3" text-anchor="end" class="fill-muted">{{ axis(top * level) }}</text>
        </template>
        <text v-for="item in ticks" :key="item.at" :x="item.x" :y="HEIGHT - 6" text-anchor="middle" class="fill-muted">{{ tick(item.at) }}</text>
      </g>
      <rect v-if="hovered !== null" :x="PAD.start + slot * hovered" :y="PAD.top" :width="slot" :height="plot.height" class="fill-content/5" />
      <g v-for="(column, index) in bars" :key="columns[index]!.start">
        <rect
          v-for="(segment, at) in column.segments"
          :key="at"
          :x="column.x"
          :y="segment.y"
          :width="bar"
          :height="Math.max(0.5, segment.height - (at < column.segments.length - 1 ? 1 : 0))"
          :fill="segment.color"
          :rx="at === column.segments.length - 1 ? Math.min(3, bar / 4) : 0"
        />
      </g>
    </svg>

    <div v-if="detail" class="ui-tip pointer-events-none absolute top-2 z-10 w-48 rounded-lg px-2.5 py-2 text-xs" :style="{ left: `${detail.left}px` }" role="status">
      <p class="text-muted">{{ detail.title }}</p>
      <ul v-if="detail.rows.length" class="mt-1.5 flex flex-col gap-1">
        <li v-for="row in detail.rows" :key="row.model" class="flex items-center gap-2">
          <span class="size-2 shrink-0 rounded-sm" :style="{ background: row.color }" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-muted">{{ row.label }}</span>
          <span class="tabular-nums">{{ format(row.value) }}</span>
        </li>
      </ul>
      <p class="mt-1.5 flex justify-end border-t border-stroke pt-1.5 font-medium tabular-nums">{{ format(detail.column.total) }}</p>
    </div>
  </div>
</template>
