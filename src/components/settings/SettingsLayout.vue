<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import SettingsLayoutPreview from '@/components/settings/SettingsLayoutPreview.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import { appLayouts, useAppearanceStore } from '@/stores/appearance'

const { t } = useI18n()
const appearance = useAppearanceStore()
</script>

<template>
  <section class="pt-8" role="radiogroup" aria-labelledby="layout-title">
    <SettingsHeading id="layout-title" :title="t('settings.appearance.layout.title')" />
    <div data-setting="layout" class="grid grid-cols-2 gap-3">
      <UiChoiceCard
        v-for="layout in appLayouts"
        :key="layout"
        v-model="appearance.layout"
        name="layout"
        :value="layout"
        class="flex flex-col gap-2 p-2"
      >
        <SettingsLayoutPreview :layout="layout" />
        <span class="px-1 pb-0.5">
          <span class="block text-sm font-medium">{{ t(`settings.appearance.layout.${layout}`) }}</span>
          <span class="mt-0.5 block text-xs/relaxed text-muted">{{ t(`settings.appearance.layout.${layout}Hint`) }}</span>
        </span>
      </UiChoiceCard>
    </div>
  </section>
</template>
