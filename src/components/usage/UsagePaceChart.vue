<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useElementWidth } from '@/composables/useElementWidth'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { QuotaSample } from '@/ipc/bindings/QuotaSample'
import type { UsageBucket } from '@/ipc/bindings/UsageBucket'
import { DAY, HOUR, MINUTE, paceCurve, windowSamples, type Pace, type Window } from '@/utils/usage'

// Fenêtre de quota de 0 à 100 % : le rythme idéal en pointillé (tout étalé jusqu'à la remise à zéro), la conso réelle,
// puis la projection au rythme moyen. Vert sous le rythme idéal, rouge au-dessus ; l'écart est teinté.
const props = defineProps<{ window: Window; pace: Pace; buckets: UsageBucket[]; samples: QuotaSample[]; step: number; now: number }>()

const { t } = useI18n()
const { formats, when } = useUsageFormat()
const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const hovered = ref<number | null>(null)
const uid = Math.random().toString(36).slice(2, 8)

const HEIGHT = 260
const PAD = { top: 16, end: 12, bottom: 24, start: 40 }
const GOOD = 'var(--color-success)'
const BAD = 'var(--color-danger)'

const plot = computed(() => ({ width: Math.max(0, width.value - PAD.start - PAD.end), height: HEIGHT - PAD.top - PAD.bottom }))
const x = (at: number) => PAD.start + ((at - props.pace.start) / props.window.duration) * plot.value.width
const y = (used: number) => PAD.top + (1 - Math.min(1, Math.max(0, used))) * plot.value.height
const ideal = (at: number) => (at - props.pace.start) / props.window.duration

const now = computed(() => Math.min(props.now, props.pace.end))
const used = computed(() => props.window.quota.used)
const curve = computed(() => paceCurve(props.window, props.buckets, props.samples, props.pace.start, now.value, props.step))
// Un point est mesuré près d'un relevé de quota (ou maintenant) ; ailleurs, il est déduit des tokens.
const measured = computed(() => [...windowSamples(props.window, props.samples, props.pace.start, now.value).map((sample) => sample.at), now.value])
const isMeasured = (at: number) => measured.value.some((point) => Math.abs(point - at) <= 20 * MINUTE)
const path = (points: { at: number; used: number }[]) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.at).toFixed(1)},${y(point.used).toFixed(1)}`).join('')
const line = computed(() => path(curve.value))
// L'écart entre la conso et le rythme idéal, fermé le long du pointillé.
const gap = computed(() => `${line.value}L${x(now.value).toFixed(1)},${y(ideal(now.value)).toFixed(1)}L${x(props.pace.start).toFixed(1)},${y(0)}Z`)

// Rythme moyen depuis le début de la fenêtre, prolongé jusqu'à la remise à zéro (ou jusqu'à 100 %).
const speed = computed(() => (now.value > props.pace.start ? used.value / (now.value - props.pace.start) : 0))
const projected = (at: number) => Math.min(1, used.value + speed.value * (at - now.value))
const projection = computed(() => {
  if (used.value >= 1 || now.value >= props.pace.end) return null
  const full = speed.value > 0 ? now.value + (1 - used.value) / speed.value : Infinity
  const points = [{ at: now.value, used: used.value }]
  if (full < props.pace.end) points.push({ at: full, used: 1 })
  points.push({ at: props.pace.end, used: projected(props.pace.end) })
  return { d: path(points), end: projected(props.pace.end), full: full < props.pace.end ? full : null }
})
const projectionLabel = computed(() => {
  const value = projection.value
  if (!value) return null
  return value.full ? t('usage.pace.fullAt', { when: when(value.full, now.value) }) : t('usage.pace.endsAt', { percent: formats.value.percent.format(value.end) })
})

// Au-dessus du pointillé, la limite tombera avant la remise à zéro.
const clip = computed(() => ({
  above: `${x(props.pace.start)},${y(0)} ${x(props.pace.end)},${y(1)} ${x(props.pace.start)},${y(1)}`,
  below: `${x(props.pace.start)},${y(0)} ${x(props.pace.end)},${y(1)} ${x(props.pace.end)},${y(0)}`,
}))

const daily = computed(() => props.window.duration > DAY)
const ticks = computed(() => {
  const list: { at: number; label: string }[] = []
  const cursor = new Date(props.pace.start)
  if (daily.value) cursor.setHours(24, 0, 0, 0)
  else cursor.setMinutes(60, 0, 0)
  for (; cursor.getTime() < props.pace.end; daily.value ? cursor.setDate(cursor.getDate() + 1) : cursor.setHours(cursor.getHours() + 1)) {
    const at = cursor.getTime()
    list.push({ at, label: daily.value ? formats.value.weekday.format(at) : formats.value.hour.format(at) })
  }
  return list
})

function usedAt(at: number) {
  if (at > now.value) return projected(at)
  const points = curve.value
  const after = points.findIndex((point) => point.at >= at)
  if (after <= 0) return points[0]?.used ?? 0
  const a = points[after - 1]!
  const b = points[after]!
  return b.at === a.at ? b.used : a.used + ((b.used - a.used) * (at - a.at)) / (b.at - a.at)
}

const TIP = 208
const detail = computed(() => {
  if (hovered.value === null) return null
  const at = hovered.value
  const value = usedAt(at)
  const points = Math.round((value - ideal(at)) * 100)
  const verdict =
    points > 0
      ? { text: t('usage.pace.above', { points }, points), class: 'text-danger' }
      : points < 0
        ? { text: t('usage.pace.below', { points: -points }, -points), class: 'text-success' }
        : { text: t('usage.pace.on'), class: 'text-muted' }
  // À droite du curseur, ou à gauche près du bord.
  const right = x(at) + 14
  const left = right + TIP > width.value ? Math.max(0, x(at) - 14 - TIP) : right
  const date = formats.value.weekdayTime.format(at)
  const kind = at > now.value ? 'projected' : isMeasured(at) ? 'measured' : 'estimated'
  return { at, value, verdict, left, title: t(`usage.pace.${kind}`, { when: date }) }
})

// Sans projection (limite atteinte), rien à montrer après maintenant.
function snap(at: number) {
  const last = projection.value ? props.pace.end : now.value
  return Math.min(last, Math.max(props.pace.start, Math.round(at / props.step) * props.step))
}

function onMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  hovered.value = snap(props.pace.start + ((event.clientX - rect.left - PAD.start) / plot.value.width) * props.window.duration)
}

function onKey(event: KeyboardEvent) {
  const move = daily.value ? HOUR : props.step
  const base = hovered.value ?? now.value
  if (event.key === 'ArrowLeft') hovered.value = snap(base - move)
  else if (event.key === 'ArrowRight') hovered.value = snap(base + move)
  else return
  event.preventDefault()
}
</script>

<template>
  <div ref="box" class="relative">
    <svg
      v-if="width"
      :width="width"
      :height="HEIGHT"
      class="block rounded-md focus-visible:outline-2 focus-visible:outline-ring"
      tabindex="0"
      role="img"
      :aria-label="t('usage.pace.label')"
      @pointermove="onMove"
      @pointerleave="hovered = null"
      @keydown="onKey"
      @blur="hovered = null"
    >
      <defs>
        <clipPath :id="`above-${uid}`"><polygon :points="clip.above" /></clipPath>
        <clipPath :id="`below-${uid}`"><polygon :points="clip.below" /></clipPath>
      </defs>

      <g class="text-[10px] tabular-nums" aria-hidden="true">
        <template v-for="level in [0, 0.25, 0.5, 0.75, 1]" :key="level">
          <line :x1="PAD.start" :x2="PAD.start + plot.width" :y1="y(level)" :y2="y(level)" class="stroke-content/6" />
          <text :x="PAD.start - 8" :y="y(level) + 3" text-anchor="end" class="fill-muted">{{ formats.percent.format(level) }}</text>
        </template>
        <text v-for="tick in ticks" :key="tick.at" :x="x(tick.at)" :y="HEIGHT - 6" text-anchor="middle" class="fill-muted">{{ tick.label }}</text>
      </g>

      <line :x1="x(pace.start)" :y1="y(0)" :x2="x(pace.end)" :y2="y(1)" class="stroke-content/40" stroke-width="1.5" stroke-dasharray="5 5" />

      <path :d="gap" :fill="BAD" fill-opacity="0.14" :clip-path="`url(#above-${uid})`" />
      <path :d="gap" :fill="GOOD" fill-opacity="0.14" :clip-path="`url(#below-${uid})`" />
      <template v-for="side in ['above', 'below']" :key="side">
        <path :d="line" :stroke="side === 'above' ? BAD : GOOD" stroke-width="2" fill="none" stroke-linejoin="round" :clip-path="`url(#${side}-${uid})`" />
        <path
          v-if="projection"
          :d="projection.d"
          :stroke="side === 'above' ? BAD : GOOD"
          stroke-width="2"
          stroke-dasharray="2 5"
          stroke-linecap="round"
          fill="none"
          :clip-path="`url(#${side}-${uid})`"
        />
      </template>

      <g class="text-[10px]" aria-hidden="true">
        <text :x="x(pace.start + window.duration * 0.9)" :y="y(0.9) + 16" text-anchor="middle" class="fill-muted">{{ t('usage.pace.ideal') }}</text>
        <text v-if="projection && projectionLabel" :x="x(pace.end) - 4" :y="y(projection.end) - 8" text-anchor="end" class="fill-content/70">{{ projectionLabel }}</text>
      </g>

      <line :x1="x(now)" :x2="x(now)" :y1="y(1)" :y2="y(0)" class="stroke-content/15" />
      <template v-if="detail">
        <line :x1="x(detail.at)" :x2="x(detail.at)" :y1="y(1)" :y2="y(0)" class="stroke-content/40" />
        <circle :cx="x(detail.at)" :cy="y(ideal(detail.at))" r="3" class="fill-content/50" />
        <circle :cx="x(detail.at)" :cy="y(detail.value)" r="4.5" :fill="detail.value > ideal(detail.at) ? BAD : GOOD" class="stroke-surface" stroke-width="2" />
      </template>
      <circle v-else :cx="x(now)" :cy="y(used)" r="4.5" :fill="used > ideal(now) ? BAD : GOOD" class="stroke-surface" stroke-width="2" />
    </svg>

    <div v-if="detail" class="ui-tip pointer-events-none absolute top-3 z-10 w-52 rounded-lg px-3 py-2.5 text-xs" :style="{ left: `${detail.left}px` }" role="status">
      <p class="text-muted">{{ detail.title }}</p>
      <p class="mt-1 text-sm font-semibold tabular-nums">{{ t('usage.pace.used', { percent: formats.percent.format(detail.value) }) }}</p>
      <p class="mt-0.5 font-medium tabular-nums" :class="detail.verdict.class">{{ detail.verdict.text }}</p>
    </div>
  </div>
</template>
