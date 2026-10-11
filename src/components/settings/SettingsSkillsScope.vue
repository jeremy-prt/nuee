<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { type Scope, useSkillsStore } from '@/stores/skills'

// Portée des réglages d'une sous-page (skill ou serveur). Repart sur Nuée à chaque ouverture : modifier la
// config de Claude Code reste un choix fait exprès, signalé en rouge.
const { t } = useI18n()
const store = useSkillsStore()
const hintId = useId()
const scopes = computed(() => (['nuee', 'everywhere'] as const).map((value) => ({ value, label: t(`settings.skills.scopes.${value}`) })))
const scope = computed({
  get: () => store.scope,
  set: (value: Scope) => (store.scope = value),
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <UiSegmented v-model="scope" :label="t('settings.skills.scope')" :options="scopes" :aria-describedby="hintId" />
    <p :id="hintId" class="text-xs" :class="scope === 'everywhere' ? 'text-danger' : 'text-muted'">{{ t(`settings.skills.scopeHints.${scope}`) }}</p>
  </div>
</template>
