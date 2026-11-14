<script setup lang="ts">
import { Check, NotebookPen } from '@/components/ui/icons'
import { inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { codeRunPlaceKey } from '@/stores/codeRuns'
import { useNotesStore } from '@/stores/notes'

// Enregistre la réponse en note, rangée dans le projet de la session ; une coche le temps de le voir, sans message.
const props = defineProps<{ text: () => string }>()

const { t } = useI18n()
const notes = useNotesStore()
// Le pane fournit déjà l'id de sa session à ses blocs de code.
const place = inject(codeRunPlaceKey, null)
const state = ref<'idle' | 'saving' | 'saved'>('idle')
let timer = 0

async function save() {
  const chatId = place?.value.chatId
  const text = props.text().trim()
  if (!chatId || !text || state.value === 'saving') return
  state.value = 'saving'
  await notes.saveText(text, chatId)
  state.value = 'saved'
  clearTimeout(timer)
  timer = window.setTimeout(() => (state.value = 'idle'), 2000)
}
</script>

<template>
  <UiIconButton :label="state === 'saved' ? t('notes.saved') : t('notes.saveAnswer')" :loading="state === 'saving'" @click="save">
    <Check v-if="state === 'saved'" class="size-3.5" aria-hidden="true" />
    <NotebookPen v-else class="size-3.5" aria-hidden="true" />
  </UiIconButton>
</template>
