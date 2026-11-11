<script setup lang="ts">
import { LoaderCircle, Orchestra, Paperclip, Plus } from '@/components/ui/icons'
import { DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuIcon, menuLabel, menuPanel, menuRow, menuTitle } from '@/components/ui/menuRow'

// Bouton « + » du champ de saisie. Le choix fait, le focus va au champ (`focusAfter`), jamais au bouton.
const props = defineProps<{ disabled: boolean; loading: boolean; orchestra: boolean; focusAfter: () => void }>()
const emit = defineEmits<{ attach: []; orchestra: [on: boolean] }>()

const { t } = useI18n()

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  props.focusAfter()
}
</script>

<template>
  <UiTooltip :label="t('composer.plus.label')" side="top">
    <span class="flex">
      <DropdownMenuRoot :modal="false">
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
            <DropdownMenuItem :text-value="t('composer.plus.attach')" :class="[menuRow, 'py-1']" @select="emit('attach')">
              <Paperclip :class="[menuIcon, 'text-info']" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('composer.plus.attach') }}</span>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              :model-value="orchestra"
              :text-value="t('composer.orchestra.label')"
              :class="[menuRow, 'py-1']"
              @update:model-value="emit('orchestra', $event === true)"
            >
              <Orchestra :class="[menuIcon, 'text-violet']" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('composer.orchestra.label') }}</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
