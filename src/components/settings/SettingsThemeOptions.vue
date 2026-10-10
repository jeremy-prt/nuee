<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { themeIntensities, themeScopes, useAppearanceStore, veilTint } from '@/stores/appearance'

const { t } = useI18n()
const appearance = useAppearanceStore()

const scopes = themeScopes.map((value) => ({ value, label: t(`settings.themes.scope.${value}`) }))
// La pastille montre la teinte du fond obtenue, renforcée pour rester lisible à cette taille.
const intensities = themeIntensities.map((value) => ({
  value,
  label: t(`settings.themes.intensity.${value}`),
  swatch: `color-mix(in srgb, var(--color-accent) ${veilTint('full', value) * 3}%, hsl(240 0% 26%))`,
}))
</script>

<template>
  <SettingsGroup :title="t('settings.themes.settingsTitle')">
    <template #action>
      <SettingsResetButton @click="appearance.resetTheme()" />
    </template>
    <SettingsRow :label="t('settings.themes.scope.label')">
      <UiSegmented v-model="appearance.themeScope" :label="t('settings.themes.scope.label')" :options="scopes" />
    </SettingsRow>
    <!-- Toujours visible, grisée en mode Boutons et liens : on voit qu'un réglage de plus existe. -->
    <SettingsRow :label="t('settings.themes.intensity.label')" :disabled="appearance.themeScope !== 'full'">
      <UiSegmented
        v-model="appearance.themeIntensity"
        :label="t('settings.themes.intensity.label')"
        :options="intensities"
        :disabled="appearance.themeScope !== 'full'"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
