<script setup lang="ts">
import { SquareMenu } from '@/components/ui/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import ChatSessionPanel from '@/components/chat/ChatSessionPanel.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

// Environnement de la session en panneau flottant, comme T3 Code et l'app Claude : il s'ouvre par-dessus, sans prendre
// la place d'un volet.
const { t } = useI18n()

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
</script>

<template>
  <UiTooltip :label="t('dock.session.title')">
    <span class="flex">
      <PopoverRoot>
        <PopoverTrigger
          class="grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-selection data-[state=open]:text-content"
          :aria-label="t('dock.session.title')"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <SquareMenu class="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            align="end"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 flex max-h-(--reka-popover-content-available-height) w-80 flex-col text-content"
            @close-auto-focus="onCloseAutoFocus"
          >
            <ChatSessionPanel />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
