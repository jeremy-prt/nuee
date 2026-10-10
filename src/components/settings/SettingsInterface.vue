<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { chatWidths, useAppearanceStore, type ZoomLevel, zoomLevels } from '@/stores/appearance'

const { t, locale } = useI18n()
const appearance = useAppearanceStore()

const options = computed(() => {
  const percent = new Intl.NumberFormat(locale.value, { style: 'percent' })
  return zoomLevels.map((level) => ({ value: String(level), label: percent.format(level / 100) }))
})

const widths = chatWidths.map((value) => ({ value, label: t(`settings.interface.chatWidth.${value}`) }))

// UiSelect travaille en chaînes, le store en nombres.
const zoom = computed({
  get: () => String(appearance.zoom),
  set: (value: string) => {
    appearance.zoom = Number(value) as ZoomLevel
  },
})
</script>

<template>
  <SettingsGroup :title="t('settings.interface.title')">
    <SettingsRow :label="t('settings.interface.zoom')">
      <UiSelect v-model="zoom" :label="t('settings.interface.zoom')" :options="options" variant="field" side="bottom" />
    </SettingsRow>
    <SettingsRow :label="t('settings.interface.chatWidth.label')">
      <UiSegmented v-model="appearance.chatWidth" :label="t('settings.interface.chatWidth.label')" :options="widths" />
    </SettingsRow>
  </SettingsGroup>
</template>
