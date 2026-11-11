<script setup lang="ts">
import { chatCard } from '@/components/chat/card'
import { onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import type { Approval } from '@/stores/conversations'
import { useShortcutsStore } from '@/stores/shortcuts'

defineProps<{ approval: Approval; agentName: string }>()
const emit = defineEmits<{ answer: [allow: boolean] }>()

const { t } = useI18n()
const titleId = useId()
const detailId = useId()
const card = useTemplateRef<HTMLElement>('card')
const shortcuts = useShortcutsStore()

// Écouté sur la carte et non la fenêtre : avec deux panes, seule la demande qui a le focus répond.
// Le focus va sur la carte, sans anneau (demande de Jérémy) : une Entrée de trop ne lance rien, Tab mène aux boutons.
function onKeydown(event: KeyboardEvent) {
  if (shortcuts.matches(event, 'deny')) {
    event.preventDefault()
    emit('answer', false)
  } else if (shortcuts.matches(event, 'approve')) {
    event.preventDefault()
    emit('answer', true)
  }
}

onMounted(() => card.value?.focus({ preventScroll: true }))
</script>

<template>
  <div
    ref="card"
    role="alertdialog"
    tabindex="-1"
    :aria-labelledby="titleId"
    :aria-describedby="approval.detail ? detailId : undefined"
    :class="chatCard"
    class="p-4 text-sm outline-none"
    @keydown="onKeydown"
  >
    <p :id="titleId" class="font-medium">{{ t('approval.title', { agent: agentName, tool: approval.name }) }}</p>
    <pre
      v-if="approval.detail"
      :id="detailId"
      class="mt-3 max-h-40 overflow-auto rounded-md bg-selection/60 p-3 font-mono text-xs whitespace-pre-wrap break-words select-text"
    >{{ approval.detail }}</pre>
    <p v-if="approval.description" class="mt-2 text-xs text-muted">{{ approval.description }}</p>
    <div class="mt-4 flex items-center justify-end gap-2">
      <UiButton :aria-keyshortcuts="shortcuts.aria('deny')" @click="emit('answer', false)">
        {{ t('approval.deny') }}
        <kbd v-if="shortcuts.label('deny')" class="font-sans text-xs text-muted" aria-hidden="true">{{ shortcuts.label('deny') }}</kbd>
      </UiButton>
      <UiButton variant="primary" :aria-keyshortcuts="shortcuts.aria('approve')" @click="emit('answer', true)">
        {{ t('approval.allow') }}
        <kbd v-if="shortcuts.label('approve')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('approve') }}</kbd>
      </UiButton>
    </div>
  </div>
</template>
