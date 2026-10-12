<script setup lang="ts" generic="T extends string">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// swatch : une pastille de couleur devant le libellé, quand l'option est une couleur.
// tooltip : explique l'option, surtout quand elle est grisée.
const props = defineProps<{
  label: string
  options: readonly { value: T; label: string; swatch?: string; disabled?: boolean; tooltip?: string }[]
  disabled?: boolean
}>()
const model = defineModel<T>({ required: true })

// Colonnes égales (auto-cols-fr) : le fond de l'option choisie glisse d'une largeur de colonne plus l'écart.
const index = computed(() => props.options.findIndex((option) => option.value === model.value))
const thumb = computed(() => ({
  width: `calc((100% - 0.25rem - ${props.options.length - 1} * 0.125rem) / ${props.options.length})`,
  transform: `translateX(calc(var(--dir, 1) * ${index.value} * (100% + 0.125rem)))`,
}))

const item =
  'relative flex h-6 items-center justify-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap text-muted transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring enabled:cursor-pointer enabled:hover:text-content disabled:opacity-40 data-[state=checked]:text-content motion-reduce:transition-none'
</script>

<template>
  <RadioGroupRoot
    v-model="model"
    :aria-label="label"
    data-control
    :disabled="disabled"
    orientation="horizontal"
    class="relative inline-grid shrink-0 auto-cols-fr grid-flow-col gap-0.5 rounded-md border border-stroke p-0.5 text-xs rtl:[--dir:-1]"
  >
    <span
      v-if="index >= 0"
      class="pointer-events-none absolute inset-y-0.5 start-0.5 rounded-[5px] bg-selection transition-transform duration-200 ease-out motion-reduce:transition-none"
      :style="thumb"
      aria-hidden="true"
    />
    <template v-for="option in options" :key="option.value">
      <!-- Grisée, l'option ne reçoit pas la souris : l'infobulle passe par l'enveloppe. -->
      <UiTooltip v-if="option.tooltip" :label="option.tooltip">
        <span class="grid">
          <RadioGroupItem :value="option.value" :disabled="option.disabled" :class="[item, 'disabled:pointer-events-none']">
            {{ option.label }}
          </RadioGroupItem>
        </span>
      </UiTooltip>
      <RadioGroupItem v-else :value="option.value" :disabled="option.disabled" :class="[item, 'disabled:cursor-not-allowed']">
        <span v-if="option.swatch" class="size-2.5 rounded-full border border-content/20" :style="{ background: option.swatch }" aria-hidden="true" />
        {{ option.label }}
      </RadioGroupItem>
    </template>
  </RadioGroupRoot>
</template>
