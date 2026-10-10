<script setup lang="ts" generic="T extends string">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'

// swatch : une pastille de couleur devant le libellé, quand l'option est une couleur.
defineProps<{ label: string; options: readonly { value: T; label: string; swatch?: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <RadioGroupRoot
    v-model="model"
    :aria-label="label"
    orientation="horizontal"
    class="inline-grid shrink-0 auto-cols-fr grid-flow-col gap-0.5 rounded-md border border-stroke p-0.5 text-xs"
  >
    <RadioGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      class="flex h-6 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap text-muted hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent data-[state=checked]:bg-selection data-[state=checked]:text-content"
    >
      <span v-if="option.swatch" class="size-2.5 rounded-full border border-content/20" :style="{ background: option.swatch }" aria-hidden="true" />
      {{ option.label }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
