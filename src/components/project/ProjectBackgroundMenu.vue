<script setup lang="ts">
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { PaintBucket } from '@/components/ui/icons'
import { colorVar, type ProjectColor, projectColors } from '@/utils/projects'

// Sous-menu « Couleur de fond » d'un projet ou d'un groupe ; null : pas de couleur.
const model = defineModel<ProjectColor | null>({ required: true })

const { t } = useI18n()
const choices = ['', ...projectColors] as const
const current = computed(() => (model.value ? t(`settings.projects.colors.${model.value}`) : t('settings.projects.backgroundNone')))
</script>

<template>
  <UiMenuSub :label="t('settings.projects.background')" :icon="PaintBucket" :value="current">
    <DropdownMenuRadioGroup class="flex flex-col gap-0.5" :model-value="model ?? ''" @update:model-value="model = ($event || null) as ProjectColor | null">
      <DropdownMenuRadioItem
        v-for="color in choices"
        :key="color"
        :value="color"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-2 pe-2.5 text-content/75 outline-none data-[highlighted]:not-data-[state=checked]:bg-selection-hover data-[highlighted]:text-content data-[state=checked]:bg-selection data-[state=checked]:text-content"
      >
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
