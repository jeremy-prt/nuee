<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import ShellBackgroundImage from '@/components/shell/ShellBackgroundImage.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { backgroundEffects, backgroundOptions, INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'

defineProps<{ path: string }>()

const { t } = useI18n()
const appearance = useAppearanceStore()

const rows = ['visibility', 'blur', 'where'] as const

function options(setting: (typeof rows)[number] | 'intensity') {
  return backgroundOptions[setting].map((value) => ({ value, label: t(`settings.background.${setting}.${value}`) }))
}
</script>

<template>
  <SettingsRow
    v-for="setting in rows"
    :key="setting"
    v-slot="{ hintId }"
    :data-setting="`background-${setting}`"
    :label="t(`settings.background.${setting}.label`)"
    :hint="setting === 'blur' ? t('settings.background.blur.hint') : undefined"
  >
    <UiSegmented
      v-model="appearance.background[setting]"
      :label="t(`settings.background.${setting}.label`)"
      :options="options(setting)"
      :aria-describedby="hintId"
    />
  </SettingsRow>

  <SettingsRow data-setting="background-effect" :label="t('settings.background.effect.label')">
    <div role="radiogroup" :aria-label="t('settings.background.effect.label')" class="grid w-full grid-cols-3 gap-2">
      <UiChoiceCard
        v-for="effect in backgroundEffects"
        :key="effect"
        v-model="appearance.background.effect"
        name="background-effect"
        :value="effect"
        class="flex flex-col gap-1 p-1.5"
      >
        <span class="relative aspect-[3/1] overflow-hidden rounded-md bg-canvas">
          <ShellBackgroundImage :path="path" :effect="effect" :level="INTENSITY_LEVEL[appearance.background.intensity]" :scale="0.15" size="small" />
        </span>
        <span class="truncate px-0.5 text-center text-xs font-medium">{{ t(`settings.background.effect.${effect}`) }}</span>
      </UiChoiceCard>
    </div>
  </SettingsRow>

  <SettingsRow
    data-setting="background-intensity"
    :label="t('settings.background.intensity.label')"
    :disabled="appearance.background.effect === 'none'"
  >
    <UiSegmented
      v-model="appearance.background.intensity"
      :label="t('settings.background.intensity.label')"
      :options="options('intensity')"
      :disabled="appearance.background.effect === 'none'"
    />
  </SettingsRow>
</template>
