<script setup lang="ts">
import { SlidersHorizontal } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import SettingsWindowPreview from '@/components/settings/SettingsWindowPreview.vue'
import UiChoiceCard from '@/components/ui/UiChoiceCard.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isMacosApp } from '@/ipc/system'
import { type GlassValues, useAppearanceStore, type WindowStyle, windowStyles } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

const { t } = useI18n()
const appearance = useAppearanceStore()
const navigation = useNavigationStore()
const available = isMacosApp()

// Écarts plus marqués que les vrais dosages : à cette taille, Mixte et Transparent se confondraient.
const OPACITIES: Record<WindowStyle, GlassValues> = {
  transparent: { chrome: 45, surface: 45 },
  mixed: { chrome: 45, surface: 90 },
  opaque: { chrome: 100, surface: 100 },
}
</script>

<template>
  <section class="pt-8" aria-labelledby="window-style-title">
    <SettingsHeading id="window-style-title" :title="t('settings.appearance.window')" />
    <p v-if="!available" id="window-style-hint" class="mb-3 text-sm text-muted">{{ t('settings.appearance.macosOnly') }}</p>

    <div
      data-setting="windowStyle"
      role="radiogroup"
      aria-labelledby="window-style-title"
      :aria-describedby="available ? undefined : 'window-style-hint'"
      class="grid grid-cols-3 gap-3"
    >
      <!-- Hors macOS, seul Opaque s'applique : les deux autres restent visibles mais grisés. -->
      <UiChoiceCard
        v-for="style in windowStyles"
        :key="style"
        v-model="appearance.windowStyle"
        name="window-style"
        :value="style"
        :disabled="!available"
        :checked="appearance.effectiveStyle === style"
        class="flex flex-col gap-2 p-2"
        :class="{ 'opacity-50': !available && style !== 'opaque' }"
      >
        <SettingsWindowPreview :values="OPACITIES[style]" />
        <span class="px-1 pb-0.5 text-sm font-medium">{{ t(`settings.appearance.styles.${style}`) }}</span>
      </UiChoiceCard>
    </div>

    <!-- Transparence du style choisi et image de fond se règlent ensemble : les deux décident de ce qu'on voit derrière. -->
    <div class="mt-3 overflow-hidden rounded-xl border border-stroke bg-content/3">
      <SettingsRow data-setting="windowBackground" :label="t('settings.appearance.background')" :hint="t('settings.appearance.backgroundHint')">
        <UiIconButton :label="t('settings.appearance.customize')" data-customize="background" @click="navigation.showSettingsDetail('background')">
          <SlidersHorizontal class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </SettingsRow>
    </div>
  </section>
</template>
