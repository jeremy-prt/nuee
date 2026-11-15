<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock } from '@/components/ui/icons'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { Pace, Window } from '@/utils/usage'

// Une limite, comme la page Usage de T3 Code : le chiffre en grand, puis une barre large qui se remplit de 0 à 100 %.
// Verte sous le rythme idéal, rouge au-dessus (la limite tombera avant la remise à zéro) ou une fois atteinte.
const props = defineProps<{ label: string; window: Window; pace: Pace | null }>()

const { t } = useI18n()
const { formats, when } = useUsageFormat()
// L'heure exacte au survol : « dans 10 heures » suffit d'un coup d'œil, pas pour planifier.
const exact = computed(() => (props.pace ? t('usage.resetsOn', { when: formats.value.weekdayTime.format(props.pace.end) }) : ''))

const used = computed(() => Math.min(1, props.window.quota.used))
const state = computed(() => {
  if (used.value >= 1) return 'bad'
  if (!props.pace) return 'idle'
  return used.value > props.pace.elapsed ? 'bad' : 'good'
})
const FILL = {
  good: 'color-mix(in oklab, var(--color-success) 42%, transparent)',
  bad: 'color-mix(in oklab, var(--color-danger) 48%, transparent)',
  idle: 'color-mix(in oklab, var(--color-content) 22%, transparent)',
}
</script>

<template>
  <div class="grid grid-cols-[13rem_minmax(0,1fr)] items-center gap-6 rounded-xl border border-stroke bg-content/3 px-5 py-4">
    <span class="flex flex-col gap-1">
      <span class="text-[13px] font-medium">{{ label }}</span>
      <span class="flex items-baseline gap-1.5">
        <span class="text-3xl font-semibold tabular-nums">{{ formats.percent.format(used) }}</span>
        <span class="text-xs text-muted">{{ t('usage.used') }}</span>
      </span>
    </span>
    <span class="relative flex h-10 items-center overflow-hidden rounded-lg bg-content/6">
      <span class="absolute inset-y-0 start-0 rounded-lg transition-[width] duration-500 motion-reduce:transition-none" :style="{ width: `${used * 100}%`, background: FILL[state] }" />
      <span class="relative ps-3 text-xs font-medium tabular-nums">{{ formats.percent.format(used) }}</span>
      <UiTooltip :label="exact" :disabled="!pace">
        <span class="relative ms-auto me-1.5 flex h-6 items-center gap-1.5 rounded-md bg-canvas/50 px-2 text-xs leading-none text-muted tabular-nums">
          <Clock class="size-3.5 shrink-0" aria-hidden="true" />
          {{ pace ? t('usage.resets', { when: when(pace.end) }) : t('usage.noReset') }}
        </span>
      </UiTooltip>
      <span class="sr-only">{{ t(`usage.state.${state}`) }}</span>
    </span>
  </div>
</template>
