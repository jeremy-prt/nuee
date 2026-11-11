<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { field, fieldText } from '@/components/ui/field'

// Nom tapé dans l'arborescence (nouveau fichier, renommage) : Entrée ou sortie du champ valide, Échap annule. Au
// renommage, seul le nom sans extension est sélectionné, comme dans le Finder.
const props = defineProps<{ initial?: string; label: string }>()
const emit = defineEmits<{ commit: [name: string]; cancel: [] }>()

const value = ref(props.initial ?? '')
const input = useTemplateRef('input')
let done = false

onMounted(async () => {
  await nextTick()
  const el = input.value
  if (!el) return
  el.focus()
  const dot = value.value.lastIndexOf('.')
  el.setSelectionRange(0, dot > 0 ? dot : value.value.length)
})

function finish(commit: boolean) {
  if (done) return
  done = true
  const name = value.value.trim()
  if (commit && name && name !== props.initial) emit('commit', name)
  else emit('cancel')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    finish(true)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    finish(false)
  }
}
</script>

<template>
  <label :class="field" class="flex-1" data-control>
    <input
      ref="input"
      v-model="value"
      type="text"
      :class="fieldText"
      :aria-label="label"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      writingsuggestions="false"
      @keydown="onKeydown"
      @blur="finish(true)"
    />
  </label>
</template>
