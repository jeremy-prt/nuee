<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { chatCard } from '@/components/chat/card'
import UiButton from '@/components/ui/UiButton.vue'
import type { Proposal } from '@/utils/activity'

// Proposition de fin de tour, comme l'app Claude : ce qui est fait, la décision qui reste, une ou deux réponses d'un
// clic envoyées comme message. `answerable` faux une fois la conversation repartie : la carte reste, sans boutons.
defineProps<{ proposal: Proposal; answerable: boolean }>()
const emit = defineEmits<{ reply: [text: string] }>()

const { t } = useI18n()
</script>

<template>
  <section :class="chatCard" class="px-4 py-3 text-sm" :aria-label="t('chat.proposal.label')">
    <p v-if="proposal.recap" class="text-muted">{{ proposal.recap }}</p>
    <p class="font-medium" :class="{ 'mt-2': proposal.recap }">{{ proposal.question }}</p>
    <div v-if="answerable" class="mt-3 flex flex-wrap justify-end gap-2">
      <UiButton
        v-for="(option, index) in proposal.options"
        :key="option"
        size="sm"
        :variant="index === 0 ? 'primary' : 'secondary'"
        @click="emit('reply', option)"
      >
        {{ option }}
      </UiButton>
    </div>
  </section>
</template>
