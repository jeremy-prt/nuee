<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { ContextCategory } from '@/ipc/bindings/ContextCategory'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'

const props = defineProps<{ usage: ContextUsage; disabled: boolean }>()
const emit = defineEmits<{ compact: [] }>()

const { t, locale } = useI18n()
const open = ref(false)

const SIZE = 14
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// Les plus grosses parts en couleur, comme l'app Claude ; les petites restent grises pour ne pas faire arc-en-ciel.
const PALETTE = ['bg-info', 'bg-orange', 'bg-success', 'bg-warning']

const ratio = computed(() => Math.min(1, props.usage.used / props.usage.window))
const tone = computed(() => (ratio.value >= 0.9 ? 'text-danger' : ratio.value >= 0.75 ? 'text-warning' : 'text-muted'))

const formats = computed(() => ({
  percent: new Intl.NumberFormat(locale.value, { style: 'percent' }),
  share: new Intl.NumberFormat(locale.value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  tokens: new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }),
}))
const percent = computed(() => formats.value.percent.format(ratio.value))
const tokens = computed(() => ({ used: formats.value.tokens.format(props.usage.used), window: formats.value.tokens.format(props.usage.window) }))

interface Row extends ContextCategory {
  color: string
  share: string
  width: string
}

const rows = computed(() => {
  const byKind = (kind: ContextCategory['kind']) => props.usage.categories.filter((category) => category.kind === kind)
  const used = [...byKind('used')].sort((a, b) => b.tokens - a.tokens)
  const row = (category: ContextCategory, color: string): Row => ({
    ...category,
    color,
    share: category.kind === 'deferred' ? '—' : formats.value.share.format(category.tokens / props.usage.window),
    width: `${(category.tokens / props.usage.window) * 100}%`,
  })
  return {
    filled: [
      ...used.map((category, i) => row(category, PALETTE[i] ?? 'bg-content/40')),
      ...byKind('buffer').map((category) => row(category, 'bg-content/25')),
    ],
    free: byKind('free').map((category) => row(category, 'bg-content/10')),
    deferred: byKind('deferred').map((category) => row(category, 'bg-content/25')),
  }
})

function compact() {
  open.value = false
  emit('compact')
}
</script>

<template>
  <!-- Comme UiMenu : l'infobulle enveloppe tout, sinon reka y rattache la position du panneau. -->
  <UiTooltip :label="t('composer.context.summary', { percent, ...tokens })" side="top" :disabled="open">
    <span class="flex shrink-0">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          class="grid size-7 shrink-0 place-items-center rounded-md hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-hover"
          :aria-label="t('composer.context.label', { percent })"
        >
          <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`" :class="tone" aria-hidden="true">
            <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="RADIUS" fill="none" stroke="currentColor" :stroke-width="STROKE" opacity="0.25" />
            <!-- Un bout arrondi laisserait un point sur un anneau vide. -->
            <circle
              v-if="ratio > 0"
              :cx="SIZE / 2"
              :cy="SIZE / 2"
              :r="RADIUS"
              fill="none"
              stroke="currentColor"
              :stroke-width="STROKE"
              stroke-linecap="round"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="CIRCUMFERENCE * (1 - ratio)"
              :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`"
            />
          </svg>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent side="top" align="end" :side-offset="6" :collision-padding="8" class="ui-pop z-50 w-80 p-3 pb-1.5 text-xs text-content">
            <p class="text-[13px] font-medium">{{ t('composer.context.title') }}</p>
            <p class="mt-2 flex items-baseline justify-between gap-2">
              <span class="text-[13px]">{{ t('composer.context.used', { percent }) }}</span>
              <span class="text-muted tabular-nums">{{ tokens.used }} / {{ tokens.window }}</span>
            </p>
            <div class="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full bg-content/10" aria-hidden="true">
              <span v-for="row in rows.filled" :key="row.name" class="h-full shrink-0" :class="row.color" :style="{ width: row.width }" />
            </div>
            <ul v-if="usage.categories.length" class="mt-3 flex flex-col gap-1.5">
              <li
                v-for="row in [...rows.filled, ...rows.free, ...rows.deferred]"
                :key="row.name"
                class="flex items-center gap-2"
                :class="{ 'text-muted': row.kind === 'deferred', 'mt-1.5': row === rows.deferred[0] }"
              >
                <span class="size-2.5 shrink-0 rounded-sm" :class="row.color" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
                <span class="text-muted tabular-nums">{{ formats.tokens.format(row.tokens) }}</span>
                <span class="w-12 text-end tabular-nums" :class="{ 'text-muted': row.kind === 'deferred' }">{{ row.share }}</span>
              </li>
            </ul>
            <div class="-mx-1.5 mt-3 flex items-center gap-3 rounded-lg bg-content/4 px-3 py-2">
              <p class="flex-1 text-muted">{{ t('composer.context.compactHint') }}</p>
              <UiButton size="sm" :disabled="disabled" @click="compact">{{ t('composer.context.compact') }}</UiButton>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
