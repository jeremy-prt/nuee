<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Le composant racine est l'infobulle : les attributs (click, aria) vont sur le bouton.
// loading : l'icône laisse place à l'indicateur, le bouton ne peut pas être relancé.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; shortcut?: string; active?: boolean; loading?: boolean; disabled?: boolean }>()
</script>

<template>
  <UiTooltip :label="label" :shortcut="shortcut">
    <button
      v-bind="$attrs"
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
      :class="{ 'bg-selection text-content': active, 'disabled:opacity-40': !loading }"
      :aria-label="label"
      :disabled="disabled || loading || undefined"
      :aria-busy="loading || undefined"
    >
      <LoaderCircle v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <slot v-else />
    </button>
  </UiTooltip>
</template>
