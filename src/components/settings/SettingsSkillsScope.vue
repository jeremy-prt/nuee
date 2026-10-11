<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { type Scope, useSkillsStore } from '@/stores/skills'

// Portée des réglages d'une sous-page (skill ou serveur). Repart sur Nuée à chaque ouverture : modifier la
// config de l'agent reste un choix fait exprès.
const { t } = useI18n()
const store = useSkillsStore()
const scopes = computed(() => (['nuee', 'everywhere'] as const).map((value) => ({ value, label: t(`settings.skills.scopes.${value}`) })))
const scope = computed({
  get: () => store.scope,
  set: (value: Scope) => (store.scope = value),
})
</script>

<template>
  <UiSegmented v-model="scope" :label="t('settings.skills.scope')" :options="scopes" />
</template>
