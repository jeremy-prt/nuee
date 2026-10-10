<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
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
      <button
        type="button"
        class="-me-2 -mb-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
        @click="appearance.resetTheme()"
      >
        <RotateCcw class="size-3.5" aria-hidden="true" />
        {{ t('settings.glass.reset') }}
      </button>
    </template>
    <SettingsRow :label="t('settings.themes.scope.label')">
      <UiSegmented v-model="appearance.themeScope" :label="t('settings.themes.scope.label')" :options="scopes" />
    </SettingsRow>
    <SettingsRow v-if="appearance.themeScope === 'full'" :label="t('settings.themes.intensity.label')">
      <UiSegmented v-model="appearance.themeIntensity" :label="t('settings.themes.intensity.label')" :options="intensities" />
    </SettingsRow>
  </SettingsGroup>
</template>
