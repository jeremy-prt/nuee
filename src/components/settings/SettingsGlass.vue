<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { useResetToast } from '@/composables/useResetToast'
import { type GlassSetting, glassOptions, glassSettings, useAppearanceStore } from '@/stores/appearance'

const { t } = useI18n()
const resetToast = useResetToast()
const appearance = useAppearanceStore()

// Le style choisi sur la page Apparence : chacun garde ses propres valeurs.
const style = computed(() => appearance.effectiveStyle)
const settings = computed(() => glassSettings(style.value))

// En Mixte, l'opacité principale ne règle plus que les barres : le centre a sa propre ligne.
function label(setting: GlassSetting) {
  if (setting === 'opacity' && style.value === 'mixed') return t('settings.glass.opacity.bars')
  return t(`settings.glass.${setting}.label`)
}

function hint(setting: GlassSetting) {
  if (setting === 'opacity' && style.value === 'mixed') return t('settings.glass.opacity.barsHint')
  if (setting === 'centerOpacity') return t('settings.glass.centerOpacity.hint')
  if (setting === 'blur') return t('settings.glass.blur.hint')
  return undefined
}

function options(setting: GlassSetting) {
  return glassOptions[setting].map((value) => ({ value, label: t(`settings.glass.${setting}.${value}`) }))
}
</script>

<template>
  <SettingsGroup :title="t('settings.glass.heading', { style: t(`settings.appearance.styles.${style}`) })">
    <template #action>
      <SettingsResetButton @click="appearance.resetGlass(style); resetToast('section')" />
    </template>
    <SettingsRow v-for="setting in settings" :key="setting" v-slot="{ hintId }" :data-setting="`glass-${setting}`" :label="label(setting)" :hint="hint(setting)">
      <UiSegmented
        v-model="appearance.glass[style][setting]"
        :label="label(setting)"
        :options="options(setting)"
        :aria-describedby="hintId"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
