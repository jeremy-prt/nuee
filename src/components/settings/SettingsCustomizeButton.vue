<script setup lang="ts">
import { SlidersHorizontal } from '@lucide/vue'

// Posé en absolu sur la carte du choix en cours : il n'apparaît que sur celle-ci. Fond léger et flou pour
// rester lisible par-dessus la vignette, sans ressortir plus que les autres boutons d'icône.
defineOptions({ inheritAttrs: false })
defineProps<{ show: boolean; label: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
    enter-from-class="scale-75 opacity-0"
    leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
    leave-to-class="scale-75 opacity-0"
  >
    <button
      v-if="show"
      v-bind="$attrs"
      type="button"
      class="absolute grid size-7 cursor-pointer place-items-center rounded-md bg-canvas/30 text-muted backdrop-blur-sm hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
      :aria-label="label"
      @click="$emit('click')"
    >
      <SlidersHorizontal class="size-3.5" aria-hidden="true" />
    </button>
  </Transition>
</template>
