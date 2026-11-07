<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useAppearanceStore } from '@/stores/appearance'
import { accentColor, type AccentId, accentIds } from '@/utils/themes'

const { t } = useI18n()
const appearance = useAppearanceStore()

const color = (id: AccentId) => accentColor(id, appearance.resolvedMode)

// Choisi : un anneau du signal autour de la pastille, porté par aria-checked (l'infobulle écrase data-state).
const ring =
  'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring aria-checked:outline-2 aria-checked:outline-ring'
</script>

<template>
  <section class="pt-8" aria-labelledby="accent-title">
    <SettingsHeading id="accent-title" :title="t('settings.accent.title')" />
    <RadioGroupRoot
      v-model="appearance.accent"
      data-setting="accent"
      aria-labelledby="accent-title"
      orientation="horizontal"
      class="flex flex-wrap items-center gap-3"
    >
      <UiTooltip v-for="id in accentIds" :key="id" :label="t(`settings.accent.names.${id}`)">
        <RadioGroupItem
          :value="id"
          :aria-label="t(`settings.accent.names.${id}`)"
          :class="ring"
          class="size-6 rounded-full border border-content/15"
          :style="{ background: color(id) }"
        />
      </UiTooltip>
    </RadioGroupRoot>
  </section>
</template>
