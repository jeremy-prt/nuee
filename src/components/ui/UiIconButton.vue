<script setup lang="ts">
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Le composant racine est l'infobulle : les attributs (click, aria, disabled) vont sur le bouton.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; shortcut?: string; active?: boolean }>()
</script>

<template>
  <UiTooltip :label="label" :shortcut="shortcut">
    <button
      v-bind="$attrs"
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      :class="{ 'bg-selection text-content': active }"
      :aria-label="label"
    >
      <slot />
    </button>
  </UiTooltip>
</template>
