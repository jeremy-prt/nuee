<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsCustomizeButton from '@/components/settings/SettingsCustomizeButton.vue'
import SettingsWindowPreview from '@/components/settings/SettingsWindowPreview.vue'
import { isMacosApp } from '@/ipc/system'
import { type GlassValues, useAppearanceStore, veilTint, type WindowStyle, windowStyles } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

const { t } = useI18n()
const appearance = useAppearanceStore()
const navigation = useNavigationStore()
const available = isMacosApp()

// Régler un style l'active aussi : la fenêtre sert d'aperçu pendant qu'on le règle.
function customize(style: WindowStyle) {
  appearance.windowStyle = style
  navigation.settingsDetail = style
}

// Écarts plus marqués que les vrais dosages : à cette taille, Mixte et Transparent se confondraient.
const OPACITIES: Record<WindowStyle, { chrome: number; surface: number }> = {
  transparent: { chrome: 45, surface: 45 },
  mixed: { chrome: 45, surface: 90 },
  opaque: { chrome: 100, surface: 100 },
}

function preview(style: WindowStyle): GlassValues {
  return { ...OPACITIES[style], lightness: 9, tint: veilTint(appearance.themeScope, appearance.themeIntensity) }
}
</script>

<template>
  <section
    class="pt-8"
    role="radiogroup"
    aria-labelledby="window-style-title"
    :aria-describedby="available ? undefined : 'window-style-hint'"
  >
    <h3 id="window-style-title" class="pb-2.5 text-sm font-semibold">{{ t('settings.appearance.window') }}</h3>
    <p v-if="!available" id="window-style-hint" class="mb-3 text-sm text-muted">{{ t('settings.appearance.macosOnly') }}</p>

    <div class="grid grid-cols-3 gap-3">
      <!-- Hors macOS, seul Opaque s'applique : les deux autres restent visibles mais grisés. -->
      <div v-for="style in windowStyles" :key="style" class="relative" :class="{ 'opacity-50': !available && style !== 'opaque' }">
        <label
          class="flex flex-col gap-2 rounded-xl border p-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
          :class="[
            appearance.effectiveStyle === style ? 'border-accent bg-selection/40' : 'border-stroke hover:bg-selection/40',
            available ? 'cursor-pointer' : 'cursor-not-allowed',
          ]"
        >
          <input
            v-model="appearance.windowStyle"
            type="radio"
            name="window-style"
            :value="style"
            :disabled="!available"
            class="sr-only"
          />
          <SettingsWindowPreview :values="preview(style)" />
          <span class="px-1 pb-0.5 text-sm font-medium">{{ t(`settings.appearance.styles.${style}`) }}</span>
        </label>
        <SettingsCustomizeButton
          :show="appearance.effectiveStyle === style"
          :data-customize="style"
          class="top-3.5 end-3.5"
          :label="t('settings.appearance.customize', { style: t(`settings.appearance.styles.${style}`) })"
          @click="customize(style)"
        />
      </div>
    </div>
  </section>
</template>
