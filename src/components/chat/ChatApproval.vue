<script setup lang="ts">
import { onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Approval } from '@/stores/conversations'

defineProps<{ approval: Approval; agentName: string }>()
const emit = defineEmits<{ answer: [allow: boolean] }>()

const { t } = useI18n()
const titleId = useId()
const detailId = useId()
const deny = useTemplateRef('deny')
const isMac = navigator.userAgent.includes('Mac')

// Échap refuse, ⌘/Ctrl+Entrée autorise. Écouté sur la carte et non la fenêtre : avec deux panes, seule
// la demande qui a le focus répond. Le focus va sur Refuser : une Entrée de trop ne lance rien.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('answer', false)
  } else if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
    event.preventDefault()
    emit('answer', true)
  }
}

onMounted(() => deny.value?.focus())
</script>

<template>
  <div
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="approval.detail ? detailId : undefined"
    class="rounded-xl border border-stroke bg-overlay p-4 shadow-lg"
    @keydown="onKeydown"
  >
    <p :id="titleId" class="text-sm font-medium">{{ t('approval.title', { agent: agentName, tool: approval.name }) }}</p>
    <pre
      v-if="approval.detail"
      :id="detailId"
      class="mt-3 max-h-40 overflow-auto rounded-md bg-selection/60 p-3 font-mono text-xs whitespace-pre-wrap break-words select-text"
    >{{ approval.detail }}</pre>
    <p v-if="approval.description" class="mt-2 text-xs text-muted">{{ approval.description }}</p>
    <div class="mt-4 flex items-center justify-between gap-2">
      <button
        ref="deny"
        type="button"
        aria-keyshortcuts="Escape"
        class="flex h-8 items-center gap-2 rounded-md bg-selection px-3 text-sm hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-accent"
        @click="emit('answer', false)"
      >
        {{ t('approval.deny') }}
        <kbd class="font-sans text-xs text-muted" aria-hidden="true">Esc</kbd>
      </button>
      <button
        type="button"
        :aria-keyshortcuts="isMac ? 'Meta+Enter' : 'Control+Enter'"
        class="flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @click="emit('answer', true)"
      >
        {{ t('approval.allow') }}
        <kbd class="font-sans text-xs opacity-60" aria-hidden="true">{{ isMac ? '⌘↵' : 'Ctrl+↵' }}</kbd>
      </button>
    </div>
  </div>
</template>
