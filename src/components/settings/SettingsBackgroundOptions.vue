<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsBackgroundThumb from '@/components/settings/SettingsBackgroundThumb.vue'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import ShellBackgroundImage from '@/components/shell/ShellBackgroundImage.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { backgroundEffects, backgroundOptions, INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'

const { t } = useI18n()
const appearance = useAppearanceStore()

const rows = ['where', 'visibility', 'intensity'] as const

function options(setting: (typeof rows)[number]) {
  return backgroundOptions[setting].map((value) => ({ value, label: t(`settings.background.${setting}.${value}`) }))
}
</script>

<template>
  <SettingsGroup :title="t('settings.background.settingsTitle')">
    <template #action>
      <SettingsResetButton @click="appearance.resetBackground()" />
    </template>
    <SettingsRow
      v-for="setting in rows"
      :key="setting"
      :label="t(`settings.background.${setting}.label`)"
      :disabled="setting === 'intensity' && appearance.background.effect === 'none'"
    >
      <UiSegmented
        v-model="appearance.background[setting]"
        :label="t(`settings.background.${setting}.label`)"
        :options="options(setting)"
        :disabled="setting === 'intensity' && appearance.background.effect === 'none'"
      />
    </SettingsRow>
  </SettingsGroup>

  <template v-if="appearance.background.path">
    <section class="pt-8" role="radiogroup" aria-labelledby="background-effect-title">
      <h3 id="background-effect-title" class="pb-2.5 text-sm font-semibold">{{ t('settings.background.effect.label') }}</h3>
      <div class="grid grid-cols-4 gap-2">
        <UiChoiceCard
          v-for="effect in backgroundEffects"
          :key="effect"
          v-model="appearance.background.effect"
          name="background-effect"
          :value="effect"
          class="flex flex-col gap-1 p-1.5"
        >
          <span class="relative aspect-[3/1] overflow-hidden rounded-lg bg-canvas">
            <ShellBackgroundImage
              :path="appearance.background.path"
              :effect="effect"
              :level="INTENSITY_LEVEL[appearance.background.intensity]"
              :scale="0.15"
              size="small"
            />
          </span>
          <span class="truncate px-0.5 text-center text-xs font-medium">{{ t(`settings.background.effect.${effect}`) }}</span>
        </UiChoiceCard>
      </div>
    </section>

    <!-- Les réglages masquent l'image : ce grand aperçu la montre telle qu'elle sera vue. -->
    <section class="pt-8" aria-labelledby="background-preview-title">
      <h3 id="background-preview-title" class="pb-2.5 text-sm font-semibold">{{ t('settings.background.preview') }}</h3>
      <SettingsBackgroundThumb :path="appearance.background.path" large />
    </section>
  </template>
</template>
