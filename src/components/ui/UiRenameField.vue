<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

// Champ de renommage posé à la place du libellé d'une ligne : marge négative, bordure et retrait s'annulent, le
// texte ne bouge pas. Entrée ou la sortie du champ valident, Échap annule.
const props = defineProps<{ value: string; label: string }>()
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
    class="-ms-1.5 h-6 min-w-0 rounded border border-stroke-focus bg-canvas/40 ps-[5px] pe-1.5 outline-none select-text"
    @keydown="onKeydown"
    @blur="finish(true)"
  />
</template>
