<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import type { Component } from 'vue'
import { menuIcon, menuLabel, menuRow } from '@/components/ui/menuRow'

// Élément d'UiContextMenu ou d'UiMoreMenu : les deux reposent sur le même menu de reka.
defineProps<{ label: string; icon?: Component; shortcut?: string; danger?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ select: [event: Event] }>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :text-value="label"
    :class="[menuRow, 'py-1.5', { 'text-danger! data-[highlighted]:bg-danger/15!': danger }]"
    @select="emit('select', $event)"
  >
    <component :is="icon" v-if="icon" :class="menuIcon" aria-hidden="true" />
    <span :class="[menuLabel, 'min-w-0 flex-1']">{{ label }}</span>
    <kbd v-if="shortcut" class="mt-0.5 font-sans text-muted">{{ shortcut }}</kbd>
  </DropdownMenuItem>
</template>
