<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

// Remplace le libellé d'une ligne le temps du renommage : l'icône (slot) reste en place, le texte ne bouge pas.
// Entrée ou la sortie du champ valident, Échap annule.
// wide : écart entre l'icône et le texte de la ligne remplacée (2,5 dans la barre latérale).
const props = defineProps<{ value: string; label: string; wide?: boolean }>()
const emit = defineEmits<{ commit: [value: string]; cancel: [] }>()

const draft = ref(props.value)
const input = useTemplateRef<HTMLInputElement>('input')
// Entrée puis la sortie du champ (le champ disparaît) : une seule validation.
let done = false

onMounted(() => {
  input.value?.focus()
  input.value?.select()
})

function finish(commit: boolean) {
  if (done) return
  done = true
  const value = draft.value.trim()
  if (commit && value && value !== props.value) emit('commit', value)
  else emit('cancel')
}

// Touches standard d'un champ, hors raccourcis réglables. Échap ne doit pas remonter jusqu'aux écouteurs globaux.
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return
  event.preventDefault()
  event.stopPropagation()
  finish(event.key === 'Enter')
}
</script>

<template>
  <div class="flex h-8 w-full items-center rounded-md bg-selection ps-2 pe-1" :class="wide ? 'gap-2.5' : 'gap-2'">
    <slot />
    <!-- Marge négative, bordure et retrait s'annulent : le texte reste à la place du libellé. -->
    <input
      ref="input"
      v-model="draft"
      type="text"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      writingsuggestions="false"
      maxlength="200"
      :aria-label="label"
      class="-ms-1.5 h-6 min-w-0 flex-1 rounded border border-stroke-focus bg-canvas/40 ps-[5px] pe-1.5 text-sm outline-none select-text"
      @keydown="onKeydown"
      @blur="finish(true)"
    />
  </div>
</template>
