<script setup lang="ts">
import { AtSign, LoaderCircle, Paperclip, Plus, Sparkles, SquareDashed } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuHint, menuIcon, menuLabel, menuPanel, menuRow, menuTitle } from '@/components/ui/menuRow'
import { isMac } from '@/utils/shortcuts'

// Bouton « + » du champ de saisie. `mention` : seulement dans un projet, le menu « @ » cherche dans son dossier.
// Le choix fait, le focus va au champ (`focusAfter`), jamais au bouton.
const props = defineProps<{ disabled: boolean; loading: boolean; mention: boolean; focusAfter: () => void }>()
const emit = defineEmits<{ attach: []; capture: []; mention: []; skill: [] }>()

const { t } = useI18n()

// Chaque icône prend la couleur de ce qu'elle insère : bleu des mentions, jaune des skills.
const entries = computed(() =>
  [
    { id: 'attach', icon: Paperclip, tint: 'rotate-45 text-info', run: () => emit('attach') },
    isMac && { id: 'capture', icon: SquareDashed, tint: 'text-orange', run: () => emit('capture') },
    props.mention && { id: 'mention', icon: AtSign, tint: 'text-mention', run: () => emit('mention') },
    { id: 'skill', icon: Sparkles, tint: 'text-skill', run: () => emit('skill') },
  ].filter((entry) => !!entry),
)

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  props.focusAfter()
}
</script>

<template>
  <UiTooltip :label="t('composer.plus.label')" side="top">
    <span class="flex">
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          :disabled="disabled || loading"
          class="grid size-7 shrink-0 place-items-center rounded-md text-content/85 hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none aria-expanded:bg-selection-inner aria-expanded:text-content"
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
            :class="[menuPanel, 'w-64']"
            @close-auto-focus="onCloseAutoFocus"
          >
            <DropdownMenuLabel :class="menuTitle">{{ t('composer.plus.label') }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="entry in entries"
              :key="entry.id"
              :text-value="t(`composer.plus.${entry.id}`)"
              :class="[menuRow, 'py-2']"
              @select="entry.run"
            >
              <component :is="entry.icon" :class="[menuIcon, entry.tint]" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span :class="menuLabel">{{ t(`composer.plus.${entry.id}`) }}</span>
                <span :class="menuHint">{{ t(`composer.plus.hints.${entry.id}`) }}</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
