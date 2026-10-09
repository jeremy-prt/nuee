<script setup lang="ts">
import { ArrowUp, Square } from '@lucide/vue'
import { ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ agentName: string; disabled: boolean; running: boolean }>()
const emit = defineEmits<{ send: [prompt: string]; stop: [] }>()

const { t } = useI18n()
const prompt = ref('')
const id = useId()
const input = useTemplateRef('input')

function submit() {
  const text = prompt.value.trim()
  if (!text || props.disabled || props.running) return
  emit('send', text)
  prompt.value = ''
  // Le bouton cliqué est remplacé par celui d'arrêt : sans ça, le focus clavier tombe sur la page.
  input.value?.focus()
}

// Entrée envoie, Maj+Entrée va à la ligne. Pendant une saisie IME, Entrée valide le mot.
function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <form
    class="rounded-xl border border-stroke bg-selection/50 p-3 focus-within:border-accent"
    :class="{ 'opacity-60': disabled }"
    @submit.prevent="submit"
  >
    <label :for="id" class="sr-only">{{ t('composer.label') }}</label>
    <textarea
      :id="id"
      ref="input"
      v-model="prompt"
      rows="3"
      :disabled="disabled"
      class="w-full resize-none bg-transparent text-sm select-text outline-none placeholder:text-muted"
      :placeholder="t('composer.placeholder')"
      @keydown.enter="onEnter"
    />
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-muted">{{ agentName }}</span>
      <button
        v-if="running"
        type="button"
        class="grid size-7 place-items-center rounded-md bg-content text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :aria-label="t('composer.stop')"
        :title="t('composer.stop')"
        @click="emit('stop')"
      >
        <Square class="size-3 fill-current" aria-hidden="true" />
      </button>
      <button
        v-else
        type="submit"
        :disabled="disabled || !prompt.trim()"
        class="grid size-7 place-items-center rounded-md bg-content text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
        :aria-label="t('composer.send')"
        :title="t('composer.send')"
      >
        <ArrowUp class="size-4" aria-hidden="true" />
      </button>
    </div>
  </form>
</template>
