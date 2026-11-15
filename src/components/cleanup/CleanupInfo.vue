<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { Info } from '@/components/ui/icons'

// Petit panneau de l'écran Activité : ce que fait le nettoyage (bouton « i ») ou ce qui n'a pas répondu. Le
// déclencheur par défaut est l'icône « i » ; `trigger` le remplace par un texte cliquable.
defineProps<{ title: string; items: string[]; empty?: string; note?: string; triggerClass?: string }>()
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger
      :class="
        triggerClass ??
        'grid size-6 place-items-center rounded-full text-current opacity-75 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring aria-expanded:opacity-100'
      "
      :aria-label="$slots.trigger ? undefined : title"
    >
      <slot name="trigger"><Info class="size-4" aria-hidden="true" /></slot>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent side="bottom" align="center" :side-offset="12" :collision-padding="8" class="ui-pop z-50 w-72 p-3 text-xs text-content">
        <p class="text-[13px] font-medium">{{ title }}</p>
        <ul v-if="items.length" class="mt-2 flex list-disc flex-col gap-1.5 ps-4 leading-snug marker:text-muted">
          <li v-for="item in items" :key="item">{{ item }}</li>
        </ul>
        <p v-else-if="empty" class="mt-2 text-muted">{{ empty }}</p>
        <p v-if="note" class="mt-2.5 leading-snug text-muted">{{ note }}</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
