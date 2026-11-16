<script setup lang="ts">
import { Server } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ServerMenuItems from '@/components/server/ServerMenuItems.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useMenuToggle } from '@/composables/useMenuToggle'
import { useServerSetup } from '@/composables/useServerSetup'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import { useConversationsStore } from '@/stores/conversations'
import { useServersStore } from '@/stores/servers'

// Menu Serveurs de l'en-tête du volet Navigateur, comme « Dev servers » dans l'app Claude.
const { t } = useI18n()
const servers = useServersStore()
const conversations = useConversationsStore()
const { chat, place } = useTerminalChat()
const { list } = useServerSetup()

const alive = (server: ServerInfo) => server.status === 'starting' || server.status === 'running'
const running = computed(() => list.value?.servers.filter(alive).length ?? 0)
const label = computed(() => (running.value ? t('dock.servers.menuRunning', { n: running.value }) : t('dock.servers.menu')))

function refresh() {
  if (chat.value && place.value) servers.refresh(chat.value.id, place.value).catch(() => {})
}

// Relu à l'ouverture du menu et en fin de tour : l'agent a pu écrire le fichier entre-temps.
watch(() => chat.value?.id, refresh, { immediate: true })
watch(
  () => (chat.value ? conversations.find(chat.value.id)?.phase : undefined),
  (phase, previous) => {
    if (phase === 'idle' && previous && previous !== 'idle') refresh()
  },
)

const { open, onTriggerDown, onOpenChange } = useMenuToggle()
function onOpen(value: boolean) {
  onOpenChange(value)
  if (open.value) refresh()
}

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
</script>

<template>
  <UiTooltip :label="t('dock.servers.menu')">
    <span class="flex">
      <DropdownMenuRoot :open="open" :modal="false" @update:open="onOpen">
        <DropdownMenuTrigger
          :disabled="!chat"
          class="relative grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="label"
          @pointerdown="(openedBy(true), onTriggerDown())"
          @keydown="openedBy(false)"
        >
          <Server class="size-4" aria-hidden="true" />
          <span v-if="running" class="absolute end-1 top-1 size-1.5 rounded-full bg-success" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            :collision-padding="8"
            :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-56']"
            @close-auto-focus="onCloseAutoFocus"
          >
            <ServerMenuItems :running="running" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
