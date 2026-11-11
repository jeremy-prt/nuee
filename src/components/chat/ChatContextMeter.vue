<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'
import { contextFormats, contextRatio, contextRows } from '@/utils/context'
import { contextTone } from '@/utils/level'

// `usage` null : pas encore mesuré, l'anneau reste vide puis se remplit en glissant quand le relevé arrive.
const props = defineProps<{ usage: ContextUsage | null; disabled: boolean }>()
const emit = defineEmits<{ compact: [] }>()

const { t, locale } = useI18n()
const open = ref(false)

const SIZE = 14
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const ratio = computed(() => (props.usage ? contextRatio(props.usage) : 0))
// Part de vide puis glisse jusqu'à sa valeur : le relevé arrivé ne saute pas aux yeux.
const filled = ref(false)
onMounted(() => requestAnimationFrame(() => (filled.value = true)))
const shown = computed(() => (filled.value ? ratio.value : 0))
const tone = computed(() => contextTone(ratio.value))

const formats = computed(() => contextFormats(locale.value))
const percent = computed(() => formats.value.percent.format(ratio.value))
const tokens = computed(() => ({ used: formats.value.tokens.format(props.usage?.used ?? 0), window: formats.value.tokens.format(props.usage?.window ?? 0) }))
const rows = computed(() => (props.usage ? contextRows(props.usage, formats.value) : null))

function compact() {
  open.value = false
  emit('compact')
}
</script>

<template>
  <!-- Comme UiMenu : l'infobulle enveloppe tout, sinon reka y rattache la position du panneau. -->
  <UiTooltip v-if="!usage" :label="t('dock.session.noContext')" side="top">
    <span class="grid size-7 shrink-0 place-items-center text-muted" role="img" :aria-label="t('dock.session.noContext')">
      <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`" aria-hidden="true">
        <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="RADIUS" fill="none" stroke="currentColor" :stroke-width="STROKE" opacity="0.25" />
      </svg>
    </span>
  </UiTooltip>
  <UiTooltip v-else :label="t('composer.context.summary', { percent, ...tokens })" side="top" :disabled="open">
    <span class="flex shrink-0">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          class="grid size-7 shrink-0 place-items-center rounded-md hover:bg-selection-inner focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-inner"
          :aria-label="t('composer.context.label', { percent })"
        >
          <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`" :class="tone.text" aria-hidden="true">
            <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="RADIUS" fill="none" stroke="currentColor" :stroke-width="STROKE" opacity="0.25" />
            <!-- Toujours là pour glisser depuis zéro ; un bout arrondi laisserait un point sur un anneau vide. -->
            <circle
              :cx="SIZE / 2"
              :cy="SIZE / 2"
              :r="RADIUS"
              fill="none"
              stroke="currentColor"
              :stroke-width="STROKE"
              :stroke-linecap="shown > 0 ? 'round' : 'butt'"
              class="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="CIRCUMFERENCE * (1 - shown)"
              :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`"
            />
          </svg>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent side="top" align="end" :side-offset="6" :collision-padding="8" class="ui-pop z-50 w-80 p-3 pb-1.5 text-xs text-content">
            <p class="text-[13px] font-medium">{{ t('composer.context.title') }}</p>
            <p class="mt-2 flex items-baseline justify-between gap-2">
              <span class="text-[13px]" :class="tone.alert && tone.text">{{ t('composer.context.used', { percent }) }}</span>
              <span class="text-muted tabular-nums">{{ tokens.used }} / {{ tokens.window }}</span>
            </p>
            <div class="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full bg-content/10" aria-hidden="true">
              <span v-for="row in rows!.filled" :key="row.name" class="h-full shrink-0" :class="row.color" :style="{ width: row.width }" />
            </div>
            <ul v-if="usage.categories.length" class="mt-3 flex flex-col gap-1.5">
              <li
                v-for="row in [...rows!.filled, ...rows!.free, ...rows!.deferred]"
                :key="row.name"
                class="flex items-center gap-2"
                :class="{ 'text-muted': row.kind === 'deferred', 'mt-1.5': row === rows!.deferred[0] }"
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
