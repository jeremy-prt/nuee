<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import SettingsModePreview from '@/components/settings/SettingsModePreview.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import { useAppearanceStore } from '@/stores/appearance'
import { colorModes } from '@/utils/themes'

const { t } = useI18n()
const appearance = useAppearanceStore()
</script>

<template>
  <section class="pt-8" role="radiogroup" aria-labelledby="mode-title">
    <SettingsHeading id="mode-title" :title="t('settings.mode.title')" />
    <div data-setting="mode" class="grid grid-cols-3 gap-3">
      <UiChoiceCard
        v-for="mode in colorModes"
        :key="mode"
        v-model="appearance.mode"
        name="mode"
        :value="mode"
        class="flex flex-col gap-2 p-2"
      >
        <SettingsModePreview :mode="mode" />
        <span class="px-1 pb-0.5 text-sm font-medium">{{ t(`settings.mode.${mode}`) }}</span>
      </UiChoiceCard>
    </div>
  </section>
</template>
