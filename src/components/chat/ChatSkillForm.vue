<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CommandItem } from '@/stores/conversations'

// Message d'ouverture d'un chat de skill, affiché par Nuée sans tour d'agent : la même forme à chaque fois.
// Les champs suivent ceux que Rust décrit à l'IA (CREATE_SKILL, EDIT_SKILL).
defineProps<{ item: CommandItem; agentName: string }>()

const { t } = useI18n()
</script>

<template>
  <div class="text-sm leading-relaxed break-words select-text">
    <template v-if="item.command.kind === 'createSkill'">
      <p class="my-2">{{ t('chat.commands.form.intro') }}</p>
      <p class="my-2"><strong class="font-semibold">{{ t('chat.commands.form.name') }}</strong> {{ t('chat.commands.form.toFill') }}</p>
      <p class="my-2">
        <strong class="font-semibold">{{ t('chat.commands.form.description') }}</strong> {{ t('chat.commands.form.descriptionHint') }}
      </p>
      <p class="my-2">
        <strong class="font-semibold">{{ t('chat.commands.automatic') }}</strong>
        {{ t('chat.commands.form.automaticHint', { agent: agentName }) }}
      </p>
    </template>
    <template v-else>
      <template v-if="item.skill">
        <p class="my-2">
          <strong class="font-semibold">{{ t('chat.commands.form.summary') }}</strong><br />{{ item.skill.description }}
        </p>
        <p class="my-2">
          <strong class="font-semibold">{{ t('chat.commands.automatic') }}</strong>
          {{ item.skill.automatic ? t('chat.commands.yes') : t('chat.commands.no') }}
        </p>
      </template>
      <p class="my-2"><strong class="font-semibold">{{ t('chat.commands.form.change') }}</strong> {{ t('chat.commands.form.toFill') }}</p>
    </template>
  </div>
</template>
