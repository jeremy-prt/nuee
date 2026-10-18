<script setup lang="ts">
import { AtSign, LoaderCircle, Paperclip, Plus, Sparkles, SquareDashed } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuHint, menuKbd, menuRow, menuRowLine, menuTitle } from '@/components/ui/menuRow'
import { isMac } from '@/utils/shortcuts'

// Bouton « + » du champ de saisie. `mention` : seulement dans un projet, le menu « @ » cherche dans son dossier.
// Le choix fait, le focus va au champ (`focusAfter`), jamais au bouton.
const props = defineProps<{ disabled: boolean; loading: boolean; mention: boolean; focusAfter: () => void }>()
const emit = defineEmits<{ attach: []; capture: []; mention: []; skill: [] }>()

const { t } = useI18n()

// Chaque icône prend la couleur de ce qu'elle insère (bleu des mentions, jaune des skills). `key` : le caractère
// qui ouvre le même menu depuis le champ.
const entries = computed(() =>
  [
    { id: 'attach', icon: Paperclip, tint: 'rotate-45 text-info', key: null, run: () => emit('attach') },
    isMac && { id: 'capture', icon: SquareDashed, tint: 'text-orange', key: null, run: () => emit('capture') },
    props.mention && { id: 'mention', icon: AtSign, tint: 'text-mention', key: '@', run: () => emit('mention') },
    { id: 'skill', icon: Sparkles, tint: 'text-skill', key: '/', run: () => emit('skill') },
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
          class="grid size-7 shrink-0 place-items-center rounded-md text-content/85 hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none aria-expanded:bg-selection-hover aria-expanded:text-content"
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
            class="ui-pop z-50 flex w-64 flex-col gap-0.5 p-1 text-xs text-content select-none"
            @close-auto-focus="onCloseAutoFocus"
          >
            <DropdownMenuLabel :class="menuTitle">{{ t('composer.plus.label') }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="entry in entries"
              :key="entry.id"
              :text-value="t(`composer.plus.${entry.id}`)"
              :class="menuRow"
              @select="entry.run"
            >
              <span :class="menuRowLine">
                <component :is="entry.icon" class="size-3.5 shrink-0" :class="entry.tint" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ t(`composer.plus.${entry.id}`) }}</span>
                <kbd v-if="entry.key" :class="menuKbd">{{ entry.key }}</kbd>
              </span>
              <span :class="menuHint">{{ t(`composer.plus.hints.${entry.id}`) }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
