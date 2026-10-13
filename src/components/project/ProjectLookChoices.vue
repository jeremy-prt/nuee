<script setup lang="ts">
import { Check } from '@lucide/vue'
import { DropdownMenuItemIndicator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectMascot from '@/components/project/ProjectMascot.vue'
import { colorVar, mascotIds, type ProjectColor, projectColors } from '@/utils/projects'

// Rangées de mascottes et de couleurs en tête du menu d'un projet ou d'un groupe. Un choix laisse le menu ouvert :
// on essaie plusieurs mascottes ou couleurs d'affilée.
defineProps<{ mascot: string; color: ProjectColor }>()
const emit = defineEmits<{ mascot: [id: string]; color: [color: ProjectColor] }>()

const { t } = useI18n()
const id = useId()

function keepOpen(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <DropdownMenuLabel :id="`${id}-mascot`" class="px-2 pt-1.5 pb-1 text-muted">{{ t('settings.projects.mascot') }}</DropdownMenuLabel>
  <DropdownMenuRadioGroup
    :model-value="mascot"
    :aria-labelledby="`${id}-mascot`"
    class="grid grid-cols-8 gap-0.5 px-1"
    @update:model-value="emit('mascot', String($event))"
  >
    <DropdownMenuRadioItem
      v-for="item in mascotIds"
      :key="item"
      :value="item"
      :text-value="t(`settings.projects.mascots.${item}`)"
      :aria-label="t(`settings.projects.mascots.${item}`)"
      class="grid size-7 cursor-pointer place-items-center rounded-md outline-none data-[highlighted]:bg-selection data-[state=checked]:bg-signal/15"
      @select="keepOpen"
    >
      <ProjectMascot :mascot="item" :color="color" class="size-5" />
    </DropdownMenuRadioItem>
  </DropdownMenuRadioGroup>

  <DropdownMenuLabel :id="`${id}-color`" class="px-2 pt-2 pb-1 text-muted">{{ t('settings.projects.color') }}</DropdownMenuLabel>
  <DropdownMenuRadioGroup
    :model-value="color"
    :aria-labelledby="`${id}-color`"
    class="grid grid-cols-9 gap-0.5 px-1 pb-1"
    @update:model-value="emit('color', $event as ProjectColor)"
  >
    <DropdownMenuRadioItem
      v-for="item in projectColors"
      :key="item"
      :value="item"
      :text-value="t(`settings.projects.colors.${item}`)"
      :aria-label="t(`settings.projects.colors.${item}`)"
      class="grid size-6 cursor-pointer place-items-center rounded-md outline-none data-[highlighted]:bg-selection"
      @select="keepOpen"
    >
      <span class="grid size-4 place-items-center rounded-full" :style="{ background: colorVar(item) }">
        <DropdownMenuItemIndicator><Check class="size-3 text-canvas" aria-hidden="true" /></DropdownMenuItemIndicator>
      </span>
    </DropdownMenuRadioItem>
  </DropdownMenuRadioGroup>
</template>
