<script setup lang="ts">
import { Sparkles, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import { useSkillsStore } from '@/stores/skills'

// Commande de Nuée posée sur un message. Contour pointillé à la couleur du thème : on la distingue d'un
// fichier joint, et on voit qu'elle part avec le message.
const props = defineProps<{ command: ChatCommand; removable?: boolean }>()
const emit = defineEmits<{ remove: [] }>()

const { t } = useI18n()
const skills = useSkillsStore()
const label = computed(() =>
  props.command.kind === 'createSkill'
    ? `/${t('composer.commands.createSkill')}`
    : `/${t('composer.commands.editSkill')} ${skills.find(props.command.id)?.name ?? props.command.id}`,
)
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-accent/60 bg-accent/10 py-1 ps-2 text-xs"
    :class="removable ? 'pe-1' : 'pe-2'"
  >
    <Sparkles class="size-3.5 shrink-0 text-accent" aria-hidden="true" />
    <span class="truncate font-medium">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      class="grid size-5 shrink-0 place-items-center rounded text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
      :aria-label="t('composer.commands.remove', { command: label })"
      :title="t('composer.commands.remove', { command: label })"
      @click="emit('remove')"
    >
      <X class="size-3" aria-hidden="true" />
    </button>
  </span>
</template>
