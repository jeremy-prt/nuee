<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'

// primary : l'action principale, à la couleur du thème. danger : une action qu'on ne défait pas. ghost : discret.
// loading : le libellé reste en place (invisible) sous l'indicateur, le bouton ne change pas de largeur.
withDefaults(
  defineProps<{ variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md'; loading?: boolean }>(),
  { variant: 'secondary', size: 'md' },
)
</script>

<template>
  <button
    type="button"
    class="relative inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:cursor-pointer disabled:cursor-not-allowed"
    :class="[
      size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
      {
        'bg-accent text-canvas enabled:hover:opacity-90': variant === 'primary',
        'border border-stroke enabled:hover:bg-selection-hover': variant === 'secondary',
        'bg-danger/15 text-danger enabled:hover:bg-danger/25': variant === 'danger',
        'text-muted enabled:hover:bg-selection-hover enabled:hover:text-content': variant === 'ghost',
        'disabled:opacity-50': !loading,
      },
    ]"
    :disabled="loading || undefined"
    :aria-busy="loading || undefined"
  >
    <span class="inline-flex items-center gap-1.5" :class="{ invisible: loading }"><slot /></span>
    <LoaderCircle v-if="loading" class="absolute size-3.5 animate-spin" aria-hidden="true" />
  </button>
</template>
