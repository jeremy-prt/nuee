<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { animationKinds, useAppearanceStore } from '@/stores/appearance'

const { t } = useI18n()
const appearance = useAppearanceStore()
</script>

<template>
  <SettingsGroup :title="t('settings.animations.title')">
    <SettingsRow
      v-for="kind in animationKinds"
      :key="kind"
      v-slot="{ hintId }"
      :data-setting="`animations-${kind}`"
      :label="t(`settings.animations.${kind}.label`)"
      :hint="t(`settings.animations.${kind}.hint`)"
    >
      <UiSwitch v-model="appearance.animations[kind]" :label="t(`settings.animations.${kind}.label`)" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>
</template>
