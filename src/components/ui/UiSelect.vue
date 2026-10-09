<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

export interface UiSelectOption {
  value: string
  label: string
  hint?: string
}

defineProps<{ label: string; options: UiSelectOption[]; disabled?: boolean }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger
      :aria-label="label"
      :title="label"
      class="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-selection data-[state=open]:text-content"
    >
      <SelectValue />
      <SelectIcon><ChevronDown class="size-3" aria-hidden="true" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        side="top"
        :side-offset="6"
        class="z-50 max-h-(--reka-select-content-available-height) min-w-40 overflow-y-auto rounded-lg border border-stroke bg-overlay p-1 text-xs text-content shadow-lg select-none"
      >
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-selection-hover"
          >
            <span class="min-w-0 flex-1">
              <SelectItemText>{{ option.label }}</SelectItemText>
              <span v-if="option.hint" class="mt-0.5 block text-muted">{{ option.hint }}</span>
            </span>
            <SelectItemIndicator class="mt-0.5"><Check class="size-3.5" aria-hidden="true" /></SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
