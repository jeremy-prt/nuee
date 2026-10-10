<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { type GlassSetting, glassOptions, glassSettings, useAppearanceStore, type WindowStyle } from '@/stores/appearance'

const props = defineProps<{ windowStyle: WindowStyle }>()

const { t } = useI18n()
const appearance = useAppearanceStore()

const settings = computed(() => glassSettings(props.windowStyle))

// En Mixte, l'opacité principale ne règle plus que les barres : le centre a sa propre ligne.
function label(setting: GlassSetting) {
  if (setting === 'opacity' && props.windowStyle === 'mixed') return t('settings.glass.opacity.bars')
  return t(`settings.glass.${setting}.label`)
}

function options(setting: GlassSetting) {
  return glassOptions[setting].map((value) => ({ value, label: t(`settings.glass.${setting}.${value}`) }))
}
</script>

<template>
  <SettingsGroup :title="props.windowStyle === 'opaque' ? t('settings.glass.backgroundTitle') : t('settings.glass.title')">
    <template #action>
      <button
        type="button"
        class="-me-2 -mb-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
        @click="appearance.resetGlass(props.windowStyle)"
      >
        <RotateCcw class="size-3.5" aria-hidden="true" />
        {{ t('settings.glass.reset') }}
      </button>
    </template>
    <SettingsRow v-for="setting in settings" :key="setting" :label="label(setting)">
      <UiSegmented
        v-model="appearance.glass[props.windowStyle][setting]"
        :label="label(setting)"
        :options="options(setting)"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
