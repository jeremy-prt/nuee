<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import type { Component } from 'vue'
import { menuIcon, menuIconSlot, menuLabel, menuRow } from '@/components/ui/menuRow'

// Élément d'UiContextMenu ou d'UiMoreMenu : les deux reposent sur le même menu de reka.
// `hint` : info utile à droite (skill qui fera l'action), jamais une explication du choix.
defineProps<{ label: string; icon?: Component; shortcut?: string; hint?: string | null; danger?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ select: [event: Event] }>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :text-value="label"
    :class="[menuRow, 'py-1', { 'text-danger! data-[highlighted]:bg-danger/15!': danger && !disabled }]"
    @select="emit('select', $event)"
  >
    <component :is="icon" v-if="icon" :class="menuIcon" aria-hidden="true" />
    <span v-else :class="menuIconSlot" aria-hidden="true" />
    <span :class="[menuLabel, 'min-w-0 flex-1']">{{ label }}</span>
    <kbd v-if="shortcut" class="mt-0.5 font-sans text-muted">{{ shortcut }}</kbd>
    <span v-if="hint" class="mt-0.5 max-w-32 shrink-0 truncate text-[11px] leading-4 text-muted">{{ hint }}</span>
  </DropdownMenuItem>
</template>
