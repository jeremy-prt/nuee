<script setup lang="ts">
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import { menuHint, menuRow, menuRowLine } from '@/components/ui/menuRow'

// Les choix d'un groupe d'UiMenu, posés dans le menu ou dans un sous-menu.
defineProps<{ section: UiMenuSection; labelledby?: string }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <DropdownMenuRadioGroup
    :model-value="section.value"
    :aria-labelledby="labelledby"
    class="flex flex-col gap-0.5"
    @update:model-value="emit('select', String($event))"
  >
    <DropdownMenuRadioItem
      v-for="option in section.options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
      :class="menuRow"
    >
      <span :class="menuRowLine">
        <component :is="option.icon" v-if="option.icon" class="size-3.5 shrink-0" :class="option.iconClass" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ option.label }}</span>
      </span>
      <span v-if="option.hint" :class="menuHint">{{ option.hint }}</span>
    </DropdownMenuRadioItem>
  </DropdownMenuRadioGroup>
</template>
