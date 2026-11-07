<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import { useAppearanceStore } from '@/stores/appearance'
import { accentColor, type ThemeId, themeIds, themes } from '@/utils/themes'

const { t } = useI18n()
const appearance = useAppearanceStore()

// La teinte des fonds du thème, forcée : à sa vraie dose, toutes les pastilles paraissaient grises. Avec la pastille
// de l'accent qu'il propose.
function swatch(id: ThemeId) {
  const mode = appearance.resolvedMode
  const { hue, [mode]: saturation } = themes[id]
  const dark = mode === 'dark'
  const lightness = dark ? 20 - ('shift' in themes[id] ? 16 : 0) : 88 + ('shift' in themes[id] ? 12 : 0)
  return {
    background: `hsl(${hue} ${Math.min(saturation * 1.6, 60)}% ${lightness}%)`,
    dot: accentColor(themes[id].accent, mode),
  }
}
</script>

<template>
  <section class="pt-8" role="radiogroup" aria-labelledby="theme-title">
    <SettingsHeading id="theme-title" :title="t('settings.themes.title')" />
    <div data-setting="theme" class="grid grid-cols-2 gap-2 @xl:grid-cols-4">
      <UiChoiceCard
        v-for="id in themeIds"
        :key="id"
        :model-value="appearance.theme"
        name="theme"
        :value="id"
        class="flex items-center gap-3 p-2.5"
        @update:model-value="appearance.applyTheme"
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-lg border border-content/15" :style="{ background: swatch(id).background }" aria-hidden="true">
          <span class="size-2.5 rounded-full" :style="{ background: swatch(id).dot }" />
        </span>
        <span class="truncate text-sm font-medium">{{ t(`settings.themes.names.${id}`) }}</span>
      </UiChoiceCard>
    </div>
  </section>
</template>
