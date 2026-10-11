<script setup lang="ts">
import { Sparkles } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CommandItem } from '@/stores/conversations'

// Scintille tant que l'agent travaille dans ce chat : tout tour y sert le skill.
const props = defineProps<{ item: CommandItem; running: boolean }>()

const { t } = useI18n()
const label = computed(() =>
  props.item.command.kind === 'createSkill'
    ? t('chat.commands.createSkill')
    : t('chat.commands.editSkill', { name: props.item.skill?.name ?? props.item.command.id }),
)
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1 text-xs">
    <Sparkles class="size-3.5 shrink-0 text-accent" aria-hidden="true" />
    <span class="font-medium text-content" :class="{ 'text-shimmer': running }">{{ label }}</span>
  </div>
</template>
