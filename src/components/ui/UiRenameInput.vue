<script setup lang="ts">
import UiRenameField from '@/components/ui/UiRenameField.vue'

// Ligne en renommage : l'icône (slot) reste en place, le champ prend celle du libellé.
// wide : écart entre l'icône et le texte de la ligne remplacée (2,5 dans la barre latérale).
defineProps<{ value: string; label: string; wide?: boolean }>()
const emit = defineEmits<{ commit: [value: string]; cancel: [] }>()
</script>

<template>
  <div class="flex h-8 w-full items-center rounded-md bg-selection ps-2 pe-1" :class="wide ? 'gap-2.5' : 'gap-2'">
    <slot />
    <UiRenameField :value="value" :label="label" class="flex-1 text-sm" @commit="emit('commit', $event)" @cancel="emit('cancel')" />
  </div>
</template>
