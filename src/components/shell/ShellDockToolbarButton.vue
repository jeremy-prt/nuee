<script setup lang="ts">
import { LoaderCircle } from '@/components/ui/icons'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Bouton d'icône d'une ligne d'outils de volet (Explorateur, Git) : les boutons se partagent la largeur à parts égales.
// `pressed` défini : bouton à bascule, annoncé par `aria-pressed` (mode du volet, recherche ouverte).
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ label: string; pressed?: boolean; loading?: boolean; disabled?: boolean }>(), { pressed: undefined })
</script>

<template>
  <UiTooltip :label="label">
    <button
      v-bind="$attrs"
      type="button"
      class="flex h-6 min-w-0 flex-1 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
      :class="[pressed ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content', { 'disabled:opacity-40': !loading }]"
      :aria-label="label"
      :aria-pressed="pressed"
      :disabled="disabled || loading || undefined"
      :aria-busy="loading || undefined"
    >
      <LoaderCircle v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <slot v-else />
    </button>
  </UiTooltip>
</template>
