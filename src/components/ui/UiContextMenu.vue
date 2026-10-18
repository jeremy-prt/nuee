<script setup lang="ts">
import { ContextMenuContent, ContextMenuPortal, ContextMenuRoot, ContextMenuTrigger } from 'reka-ui'
import { menuPanel } from '@/components/ui/menuRow'

// Clic droit sur la zone du slot par défaut ; le slot `menu` reçoit les UiMenuItem, communs avec UiMoreMenu.
// Ouvert à la souris : le focus ne revient pas allumer le contour de la ligne à la fermeture.
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <ContextMenuRoot :modal="false" @update:open="emit('update:open', $event)">
    <ContextMenuTrigger as="div" :disabled="disabled">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent
        :collision-padding="8"
        :class="[menuPanel, 'max-h-(--reka-context-menu-content-available-height) max-w-72 min-w-52']"
        @close-auto-focus.prevent
      >
        <slot name="menu" />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
