<script setup lang="ts">
import { DropdownMenuCheckboxItem } from 'reka-ui'
import type { Component } from 'vue'
import { menuIcon, menuLabel } from '@/components/ui/menuRow'

// Option oui/non d'un menu, l'interrupteur dessiné à droite. Le menu reste ouvert pour en régler plusieurs.
defineProps<{ label: string; icon?: Component; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <DropdownMenuCheckboxItem
    v-model="model"
    :disabled="disabled"
    :text-value="label"
    class="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-content outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-selection-hover"
    @select.prevent
  >
    <component :is="icon" v-if="icon" :class="[menuIcon, 'mt-0']" aria-hidden="true" />
    <span :class="[menuLabel, 'min-w-0 flex-1']">{{ label }}</span>
    <span
      class="ms-3 inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none"
      :class="model ? 'bg-signal' : 'bg-selection-hover'"
      aria-hidden="true"
    >
      <span
        class="block size-3 rounded-full shadow-sm transition-[translate,background-color] duration-200 motion-reduce:transition-none"
        :class="model ? 'translate-x-3 bg-on-signal rtl:-translate-x-3' : 'bg-content'"
      />
    </span>
  </DropdownMenuCheckboxItem>
</template>
