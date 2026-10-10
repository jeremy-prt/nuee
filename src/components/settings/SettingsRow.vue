<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'

// `hintId` est passé au slot : le contrôle le cite en aria-describedby pour que l'aide soit lue avec lui.
// Le slot `hint` remplace le texte d'aide quand il change au fil d'une action (une recherche, par exemple).
const props = defineProps<{ label: string; hint?: string; disabled?: boolean }>()
const slots = useSlots()
const id = useId()
const hintId = computed(() => (props.hint || slots.hint ? id : undefined))
</script>

<template>
  <div
    data-setting-row
    class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stroke px-4 py-2.5 transition-opacity last:border-b-0 motion-reduce:transition-none"
    :class="{ 'opacity-40': disabled }"
  >
    <div class="min-w-40 flex-1">
      <p class="text-sm font-medium">{{ label }}</p>
      <p v-if="hintId" :id="hintId" class="mt-0.5 max-w-lg text-xs/relaxed text-muted">
        <slot name="hint">{{ hint }}</slot>
      </p>
    </div>
    <slot :hint-id="hintId" />
  </div>
</template>
