<script setup lang="ts">
import { Check } from '@/components/ui/icons'
import { DropdownMenuItemIndicator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { menuTitle } from '@/components/ui/menuRow'
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { type IconColor, iconColors, iconColorVar } from '@/utils/projects'

// Couleurs de l'initiale en tête du menu d'un projet. Un choix laisse le menu ouvert : on en essaie plusieurs d'affilée.
defineProps<{ color: IconColor }>()
const emit = defineEmits<{ color: [color: IconColor] }>()

const { t } = useI18n()
const id = useId()

function keepOpen(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <DropdownMenuLabel :id="`${id}-color`" :class="menuTitle">{{ t('settings.projects.color') }}</DropdownMenuLabel>
  <DropdownMenuRadioGroup
    :model-value="color"
    :aria-labelledby="`${id}-color`"
    class="grid grid-cols-10 gap-0.5 px-1 pb-1"
    @update:model-value="emit('color', $event as IconColor)"
  >
    <DropdownMenuRadioItem
      v-for="item in iconColors"
      :key="item"
      :value="item"
      :text-value="t(`settings.projects.colors.${item}`)"
      :aria-label="t(`settings.projects.colors.${item}`)"
      class="grid size-6 cursor-pointer place-items-center rounded-md outline-none data-[highlighted]:bg-selection-hover"
      @select="keepOpen"
    >
      <span class="grid size-4 place-items-center rounded-full" :style="{ background: iconColorVar(item) }">
        <DropdownMenuItemIndicator><Check class="size-3 text-canvas" aria-hidden="true" /></DropdownMenuItemIndicator>
      </span>
    </DropdownMenuRadioItem>
  </DropdownMenuRadioGroup>
</template>
