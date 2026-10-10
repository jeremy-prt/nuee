<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsCustomizeButton from '@/components/settings/SettingsCustomizeButton.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import { useAppearanceStore } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'
import { type ThemeId, themeIds, themes } from '@/utils/themes'

const { t } = useI18n()
const appearance = useAppearanceStore()
const navigation = useNavigationStore()

// Un nuage de la couleur éclairé en haut à gauche, et une teinte voisine en bas à droite pour la profondeur.
function orb(id: ThemeId) {
  const { hue, saturation, lightness } = themes[id]
  return {
    background: [
      `radial-gradient(circle at 30% 25%, hsl(${hue} ${saturation}% ${Math.min(lightness + 24, 94)}%) 0%, transparent 45%)`,
      `radial-gradient(circle at 72% 75%, hsl(${hue + 24} ${saturation}% ${lightness - 6}%) 0%, transparent 55%)`,
      `radial-gradient(circle at 50% 45%, hsl(${hue} ${saturation}% ${lightness}%) 0%, hsl(${hue} ${Math.round(saturation * 0.6)}% 16%) 100%)`,
    ].join(', '),
  }
}
</script>

<template>
  <section class="pt-8" role="radiogroup" aria-labelledby="theme-title">
    <h3 id="theme-title" class="pb-2.5 text-sm font-semibold">{{ t('settings.themes.title') }}</h3>
    <div class="grid grid-cols-2 gap-2 @xl:grid-cols-4">
      <div v-for="id in themeIds" :key="id" class="relative">
        <UiChoiceCard
          v-model="appearance.theme"
          name="theme"
          :value="id"
          class="flex items-center gap-3 p-2.5"
          :class="{ 'pe-11': appearance.theme === id }"
        >
          <span class="size-7 shrink-0 rounded-full shadow-md ring-1 ring-content/10 ring-inset" :style="orb(id)" aria-hidden="true" />
          <span class="truncate text-sm font-medium">{{ t(`settings.themes.names.${id}`) }}</span>
        </UiChoiceCard>
        <SettingsCustomizeButton
          :show="appearance.theme === id"
          data-customize="theme"
          class="end-2.5 top-1/2 -translate-y-1/2"
          :label="t('settings.themes.customize')"
          @click="navigation.showSettingsDetail('theme')"
        />
      </div>
    </div>
  </section>
</template>
