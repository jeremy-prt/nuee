<script setup lang="ts">
import { LoaderCircle } from '@/components/ui/icons'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Le composant racine est l'infobulle : les attributs (click, aria) vont sur le bouton.
// loading : l'icône laisse place à l'indicateur, le bouton ne peut pas être relancé.
// inner : posé sur une ligne qui peut être surlignée, son survol passe au cran au-dessus (selection-inner).
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; shortcut?: string; active?: boolean; loading?: boolean; disabled?: boolean; inner?: boolean }>()
</script>

<template>
  <UiTooltip :label="label" :shortcut="shortcut">
    <button
      v-bind="$attrs"
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
      :class="[
        active ? 'bg-selection text-content' : ['text-muted hover:text-content', inner ? 'hover:bg-selection-inner' : 'hover:bg-selection-hover'],
        { 'disabled:opacity-40': !loading },
      ]"
      :aria-label="label"
      :disabled="disabled || loading || undefined"
      :aria-busy="loading || undefined"
    >
      <LoaderCircle v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <slot v-else />
    </button>
  </UiTooltip>
</template>
