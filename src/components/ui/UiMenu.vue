<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from 'reka-ui'
import { type Component, computed, useId } from 'vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

export interface UiMenuOption {
  value: string
  label: string
  hint?: string
  icon?: Component
  iconClass?: string
  disabled?: boolean
}

// Un groupe de choix exclusifs. Plusieurs groupes (modèle et effort) passent chacun en sous-menu, comme monocode :
// une longue liste de modèles ne recouvre pas la fenêtre.
export interface UiMenuSection {
  id: string
  label?: string
  value: string
  options: UiMenuOption[]
}

// Pastille d'une barre d'outils : le slot montre la valeur, `label` nomme le menu (infobulle, lecteur d'écran).
// `look` remplace le fond et la taille de la pastille (bouton discret dans une ligne de texte).
const props = withDefaults(
  defineProps<{
    label: string
    sections: UiMenuSection[]
    disabled?: boolean
    side?: 'top' | 'bottom'
    focusAfter?: () => void
    look?: string
  }>(),
  { side: 'top' },
)
const emit = defineEmits<{ select: [section: string, value: string] }>()

const id = useId()
const nested = computed(() => props.sections.length > 1)
const current = (section: UiMenuSection) => section.options.find((option) => option.value === section.value)?.label

// Même logique que UiSelect : ouvert à la souris, le focus ne revient pas allumer le contour du bouton.
let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}

function onCloseAutoFocus(event: Event) {
  if (props.focusAfter) {
    event.preventDefault()
    props.focusAfter()
  } else if (byPointer) {
    event.preventDefault()
  }
}
</script>

<template>
  <!-- L'infobulle enveloppe tout le menu : placée entre les deux, reka y rattacherait la position du menu. -->
  <UiTooltip :label="label" :side="side">
    <span class="flex min-w-0">
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          :disabled="disabled"
          class="group flex min-w-0 items-center gap-1.5 rounded-md text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
          :class="look ?? 'h-7 bg-selection ps-1.5 pe-2 text-content hover:bg-selection-hover aria-expanded:bg-selection-hover'"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <span class="sr-only">{{ label }}</span>
          <slot />
          <ChevronDown
            class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            :side="side"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 max-h-(--reka-dropdown-menu-content-available-height) max-w-80 min-w-48 overflow-y-auto p-1 text-xs text-content select-none"
            @close-auto-focus="onCloseAutoFocus"
          >
            <template v-if="nested">
              <DropdownMenuSub v-for="section in sections" :key="section.id">
                <DropdownMenuSubTrigger
                  class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-2 pe-1.5 text-content outline-none data-[highlighted]:bg-selection data-[state=open]:bg-selection"
                >
                  <span class="flex-1">{{ section.label }}</span>
                  <span class="text-muted">{{ current(section) }}</span>
                  <ChevronRight class="size-3 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    :side-offset="6"
                    :collision-padding="8"
                    class="ui-pop z-50 max-h-(--reka-dropdown-menu-content-available-height) max-w-80 min-w-44 overflow-y-auto p-1 text-xs text-content select-none"
                  >
                    <UiMenuChoices :section="section" @select="emit('select', section.id, $event)" />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </template>
            <template v-else>
              <DropdownMenuLabel v-if="sections[0]?.label" :id="`${id}-label`" class="px-2 pt-1.5 pb-1 text-muted">
                {{ sections[0].label }}
              </DropdownMenuLabel>
              <UiMenuChoices
                v-if="sections[0]"
                :section="sections[0]"
                :labelledby="sections[0].label ? `${id}-label` : undefined"
                @select="emit('select', sections[0].id, $event)"
              />
            </template>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
