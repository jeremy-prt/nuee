<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { type FollowUp, useGeneralStore } from '@/stores/general'

const { t } = useI18n()
const general = useGeneralStore()

const followUpOptions = computed(() =>
  (['queue', 'steer'] as const).map((value) => ({ value, label: t(`settings.general.sessions.followUpOptions.${value}`) })),
)
// UiSelect travaille en chaînes, le store en valeurs connues.
const followUp = computed({
  get: () => general.followUp,
  set: (value: string) => {
    general.followUp = value as FollowUp
  },
})
</script>

<template>
  <SettingsGroup :title="t('settings.general.sessions.title')">
    <SettingsRow data-setting="followUp" :label="t('settings.general.sessions.followUp')" :hint="t(`settings.general.sessions.followUpHints.${general.followUp}`)">
      <UiSelect v-model="followUp" :label="t('settings.general.sessions.followUp')" :options="followUpOptions" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="autoResume" :label="t('settings.general.sessions.autoResume')" :hint="t('settings.general.sessions.autoResumeHint')">
      <UiSwitch v-model="general.autoResume" :label="t('settings.general.sessions.autoResume')" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>
</template>
