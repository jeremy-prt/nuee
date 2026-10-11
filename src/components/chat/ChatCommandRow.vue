<script setup lang="ts">
import { Sparkles } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import { useSkillsStore } from '@/stores/skills'

// Affiché à la place du premier message, qui n'est qu'un déclencheur : les consignes viennent de Rust.
const props = defineProps<{ command: ChatCommand; running: boolean }>()

const { t } = useI18n()
const skills = useSkillsStore()
const label = computed(() =>
  props.command.kind === 'createSkill'
    ? t('chat.commands.createSkill')
    : t('chat.commands.editSkill', { name: skills.find(props.command.id)?.name ?? props.command.id }),
)
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1 text-xs">
    <Sparkles class="size-3.5 shrink-0 text-accent" aria-hidden="true" />
    <span class="font-medium text-content" :class="{ 'text-shimmer': running }">{{ label }}</span>
  </div>
</template>
