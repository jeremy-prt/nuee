<script setup lang="ts">
import { Ban, Check } from '@lucide/vue'
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/stores/projects'
import { colorVar, type ProjectColor, projectColors } from '@/utils/projects'

// Couleur de fond des sessions d'un projet, dans ses réglages. « Aucune » (valeur vide) garde le fond de l'app.
const props = defineProps<{ project: Project }>()

const { t } = useI18n()

const value = computed({
  get: () => props.project.background ?? '',
  set: (color: string) => (props.project.background = (color || null) as ProjectColor | null),
})
</script>

<template>
  <RadioGroupRoot v-model="value" :aria-label="t('settings.projects.background')" orientation="horizontal" class="flex flex-wrap justify-end gap-1.5">
    <RadioGroupItem
      value=""
      :aria-label="t('settings.projects.backgroundNone')"
      class="grid size-6 cursor-pointer place-items-center rounded-full border border-stroke text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-checked:border-stroke-focus aria-checked:text-content"
    >
      <Ban class="size-3.5" aria-hidden="true" />
    </RadioGroupItem>
    <RadioGroupItem
      v-for="color in projectColors"
      :key="color"
      :value="color"
      :aria-label="t(`settings.projects.colors.${color}`)"
      class="grid size-6 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      :style="{ background: colorVar(color) }"
    >
      <RadioGroupIndicator><Check class="size-3.5 text-canvas" aria-hidden="true" /></RadioGroupIndicator>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
