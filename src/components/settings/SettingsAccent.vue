<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { useI18n } from 'vue-i18n'
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
  <!-- Partie du bloc Thème : la couleur est une variante du thème, comme dans T3 Code. -->
  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
    <h3 id="accent-title" class="text-xs font-medium text-muted">{{ t('settings.accent.title') }}</h3>
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
    <button
      v-if="appearance.accentCustom"
      type="button"
      class="rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
      @click="appearance.resetAccent"
    >
      {{ t('settings.accent.reset') }}
    </button>
  </div>
</template>
