<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { getSystemLocale, localeNames, locales } from '@/i18n'
import { type LanguageChoice, useGeneralStore } from '@/stores/general'

const { t } = useI18n()
const general = useGeneralStore()

onMounted(() => general.loadAutostart())

const languages = computed(() => [
  { value: 'auto', label: t('settings.general.system.auto', { language: localeNames[getSystemLocale()] }) },
  ...locales.map((locale) => ({ value: locale, label: localeNames[locale] })),
])

// UiSelect travaille en chaînes, le store en langues connues.
const language = computed({
  get: () => general.language,
  set: (value: string) => {
    general.language = value as LanguageChoice
  },
})
</script>

<template>
  <SettingsGroup :title="t('settings.general.system.title')">
    <SettingsRow data-setting="language" :label="t('settings.general.system.language')">
      <UiSelect v-model="language" :label="t('settings.general.system.language')" :options="languages" variant="field" side="bottom" />
    </SettingsRow>
    <SettingsRow data-setting="autostart" :label="t('settings.general.system.autostart')" :disabled="general.autostart === null">
      <UiSwitch
        :model-value="general.autostart ?? false"
        :label="t('settings.general.system.autostart')"
        :disabled="general.autostart === null"
        @update:model-value="general.toggleAutostart"
      />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="keepAwake" :label="t('settings.general.system.keepAwake')" :hint="t('settings.general.system.keepAwakeHint')">
      <UiSwitch v-model="general.keepAwake" :label="t('settings.general.system.keepAwake')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow data-setting="confirmDelete" :label="t('settings.general.system.confirmDelete')">
      <UiSwitch v-model="general.confirmDelete" :label="t('settings.general.system.confirmDelete')" />
    </SettingsRow>
  </SettingsGroup>
</template>
