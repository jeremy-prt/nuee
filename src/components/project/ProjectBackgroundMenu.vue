<script setup lang="ts">
import { DropdownMenuItemIndicator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { Check, PaintBucket } from '@/components/ui/icons'
import { colorVar, type ProjectColor, projectColors } from '@/utils/projects'

// Sous-menu « Couleur de fond » d'un projet ou d'un groupe ; null : pas de couleur.
const model = defineModel<ProjectColor | null>({ required: true })

const { t } = useI18n()
const choices = ['', ...projectColors] as const
const current = computed(() => (model.value ? t(`settings.projects.colors.${model.value}`) : t('settings.projects.backgroundNone')))
</script>

<template>
  <UiMenuSub :label="t('settings.projects.background')" :icon="PaintBucket" :value="current">
    <DropdownMenuRadioGroup :model-value="model ?? ''" @update:model-value="model = ($event || null) as ProjectColor | null">
      <DropdownMenuRadioItem
        v-for="color in choices"
        :key="color"
        :value="color"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-1.5 pe-2.5 text-content/75 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content"
      >
        <span class="grid size-3.5 shrink-0 place-items-center">
          <DropdownMenuItemIndicator><Check class="size-3" aria-hidden="true" /></DropdownMenuItemIndicator>
        </span>
        <span
          class="size-3 shrink-0 rounded-full"
          :class="{ 'border border-stroke-focus': !color }"
          :style="color ? { background: colorVar(color) } : undefined"
          aria-hidden="true"
        />
        {{ color ? t(`settings.projects.colors.${color}`) : t('settings.projects.backgroundNone') }}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </UiMenuSub>
</template>
