<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatCard } from '@/components/chat/card'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useShortcutsStore } from '@/stores/shortcuts'
import type { Proposal } from '@/utils/activity'

// Proposition de fin de tour, comme l'app Claude : ce qui est fait, la décision qui reste, une ou deux réponses d'un
// clic envoyées comme message. La première est mise en avant (⌘↵) tant que le champ est vide ; dès qu'on y écrit, les
// deux redeviennent égales. `answerable` faux une fois la conversation repartie : la carte reste, sans boutons.
const props = defineProps<{ proposal: Proposal; answerable: boolean; typing: boolean }>()
const emit = defineEmits<{ reply: [text: string]; dismiss: [] }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()

function onKeydown(event: KeyboardEvent) {
  if (!props.answerable || props.typing || event.defaultPrevented || !shortcuts.matches(event, 'approve')) return
  event.preventDefault()
  event.stopPropagation()
  emit('reply', props.proposal.options[0]!)
}
// En capture : le champ de saisie (vide) prendrait sinon ⌘↵ pour lui.
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <section :class="chatCard" class="relative px-4 py-3 text-sm" :aria-label="t('chat.proposal.label')">
    <UiIconButton v-if="answerable" :label="t('chat.proposal.dismiss')" class="absolute end-2 top-2 size-6!" @click="emit('dismiss')">
      <X class="size-3.5" aria-hidden="true" />
    </UiIconButton>
    <p v-if="proposal.recap" class="pe-6 text-muted">{{ proposal.recap }}</p>
    <p :class="{ 'mt-2': proposal.recap }">{{ proposal.question }}</p>
    <div v-if="answerable" class="mt-3 flex flex-wrap gap-2">
      <UiButton
        v-for="(option, index) in proposal.options"
        :key="option"
        size="sm"
        :variant="index === 0 && !typing ? 'primary' : 'secondary'"
        @click="emit('reply', option)"
      >
        {{ option }}
        <kbd v-if="index === 0 && !typing && shortcuts.label('approve')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('approve') }}</kbd>
      </UiButton>
    </div>
  </section>
</template>
