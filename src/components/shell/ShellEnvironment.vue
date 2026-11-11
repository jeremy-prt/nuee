<script setup lang="ts">
import { SquareMenu } from '@/components/ui/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSessionPanel from '@/components/chat/ChatSessionPanel.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useSessionGitStore } from '@/stores/sessionGit'

// Environnement de la session en panneau flottant, comme T3 Code et l'app Claude : il s'ouvre par-dessus, sans prendre
// la place d'un volet. Masqué avant le premier message : le formulaire de nouvelle session montre déjà le projet,
// la machine et la branche.
const { t } = useI18n()
const { chat } = useTerminalChat()
const sessionGit = useSessionGitStore()

// Des modifications non commitées se voient sans ouvrir le panneau, la pastille du champ n'existant plus.
const changed = computed(() => !!chat.value && (sessionGit.states[chat.value.id]?.changes.files ?? 0) > 0)
const label = computed(() => (changed.value ? t('dock.session.titleChanged') : t('dock.session.title')))

const open = ref(false)
let byPointer = false
// Fermé par une ligne qui mène à un volet : le focus y va, pas sur le bouton.
let handedOff = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function close() {
  handedOff = true
  open.value = false
}
function onCloseAutoFocus(event: Event) {
  if (byPointer || handedOff) event.preventDefault()
  handedOff = false
}
</script>

<template>
  <UiTooltip v-if="chat?.started" :label="t('dock.session.title')">
    <span class="flex">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          class="relative grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-selection data-[state=open]:text-content"
          :aria-label="label"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <SquareMenu class="size-4" aria-hidden="true" />
          <span v-if="changed" class="absolute end-1 top-1 size-1.5 rounded-full bg-warning" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            align="end"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 flex max-h-(--reka-popover-content-available-height) w-80 flex-col text-content"
            @close-auto-focus="onCloseAutoFocus"
          >
            <ChatSessionPanel @close="close" />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
