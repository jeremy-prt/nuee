<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import type { Component } from 'vue'

// Élément d'UiContextMenu ou d'UiMoreMenu : les deux reposent sur le même menu de reka.
defineProps<{ label: string; icon?: Component; shortcut?: string; danger?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ select: [event: Event] }>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :text-value="label"
    class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-2 pe-2.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
    :class="danger ? 'text-danger data-[highlighted]:bg-danger/15' : 'text-content/75 data-[highlighted]:bg-selection data-[highlighted]:text-content'"
    @select="emit('select', $event)"
  >
    <component :is="icon" v-if="icon" class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="min-w-0 flex-1 truncate">{{ label }}</span>
    <kbd v-if="shortcut" class="font-sans text-muted">{{ shortcut }}</kbd>
  </DropdownMenuItem>
</template>
