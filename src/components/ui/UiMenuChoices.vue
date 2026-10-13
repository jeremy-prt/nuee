<script setup lang="ts">
import { Check } from '@/components/ui/icons'
import { DropdownMenuItemIndicator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'

// Les choix d'un groupe d'UiMenu, posés dans le menu ou dans un sous-menu.
defineProps<{ section: UiMenuSection; labelledby?: string }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <DropdownMenuRadioGroup
    :model-value="section.value"
    :aria-labelledby="labelledby"
    @update:model-value="emit('select', String($event))"
  >
    <DropdownMenuRadioItem
      v-for="option in section.options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
      class="flex cursor-pointer items-start gap-2 rounded-md py-1.5 ps-1.5 pe-2.5 text-content/75 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content"
    >
      <span class="grid size-3.5 shrink-0 place-items-center pt-px">
        <DropdownMenuItemIndicator><Check class="size-3" aria-hidden="true" /></DropdownMenuItemIndicator>
      </span>
      <component :is="option.icon" v-if="option.icon" class="mt-px size-3.5 shrink-0" :class="option.iconClass" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        {{ option.label }}
        <span v-if="option.hint" class="mt-0.5 block text-muted">{{ option.hint }}</span>
      </span>
    </DropdownMenuRadioItem>
  </DropdownMenuRadioGroup>
</template>
