<script setup lang="ts">
import { AtSign, Crop, LoaderCircle, Paperclip, Plus, Sparkles } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { isMac } from '@/utils/shortcuts'

// Bouton « + » du champ de saisie. `mention` : seulement dans un projet, le menu « @ » cherche dans son dossier.
// Le choix fait, le focus va au champ (`focusAfter`), jamais au bouton.
const props = defineProps<{ disabled: boolean; loading: boolean; mention: boolean; focusAfter: () => void }>()
const emit = defineEmits<{ attach: []; capture: []; mention: []; skill: [] }>()

const { t } = useI18n()

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  props.focusAfter()
}
</script>

<template>
  <UiTooltip :label="t('composer.plus.label')">
    <span class="flex">
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          :disabled="disabled || loading"
          class="grid size-7 shrink-0 place-items-center rounded-md bg-selection text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none aria-expanded:bg-selection-hover"
          :class="{ 'disabled:opacity-40': !loading }"
          :aria-label="t('composer.plus.label')"
          :aria-busy="loading || undefined"
        >
          <LoaderCircle v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Plus v-else class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            side="top"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 min-w-52 p-1 text-xs text-content select-none"
            @close-auto-focus="onCloseAutoFocus"
          >
            <UiMenuItem :label="t('composer.attach')" :icon="Paperclip" @select="emit('attach')" />
            <UiMenuItem v-if="isMac" :label="t('composer.plus.capture')" :icon="Crop" @select="emit('capture')" />
            <UiMenuItem v-if="mention" :label="t('composer.plus.mention')" :icon="AtSign" @select="emit('mention')" />
            <UiMenuItem :label="t('composer.plus.skill')" :icon="Sparkles" @select="emit('skill')" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
