<script setup lang="ts">
import { Globe, Logs, Play, Plus, Server, Stop, Wrench } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { type Component, computed, h, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ServerStatusDot from '@/components/server/ServerStatusDot.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import { useServerSetup } from '@/composables/useServerSetup'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import type { ServerStatus } from '@/ipc/bindings/ServerStatus'
import { useBrowserStore } from '@/stores/browser'
import { useConversationsStore } from '@/stores/conversations'
import { useServersStore } from '@/stores/servers'

// Menu Serveurs de l'en-tête du volet Navigateur, comme « Dev servers » dans l'app Claude.
const { t } = useI18n()
const servers = useServersStore()
const conversations = useConversationsStore()
const browser = useBrowserStore()
const { chat, place } = useTerminalChat()
const { list, ask } = useServerSetup()

const alive = (server: ServerInfo) => server.status === 'starting' || server.status === 'running'
const running = computed(() => list.value?.servers.filter(alive).length ?? 0)

const dots = new Map<ServerStatus, Component>()
const dot = (status: ServerStatus) => {
  if (!dots.has(status)) dots.set(status, () => h(ServerStatusDot, { status }))
  return dots.get(status)!
}

function state(server: ServerInfo) {
  if (alive(server)) return `:${server.activePort ?? server.port}`
  if (server.status === 'exited') return t('dock.servers.status.exited')
  return t('dock.servers.status.stopped')
}

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

function onOpen(open: boolean) {
  if (open) refresh()
}

// Comme ▶ dans le volet : le serveur démarre et sa page s'ouvre.
function start(server: ServerInfo) {
  if (chat.value && place.value) browser.openServer(chat.value.id, place.value, server)
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
      <DropdownMenuRoot :modal="false" @update:open="onOpen">
        <DropdownMenuTrigger
          :disabled="!chat"
          class="relative grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="running ? t('dock.servers.menuRunning', { n: running }) : t('dock.servers.menu')"
          @pointerdown="openedBy(true)"
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
            <DropdownMenuLabel :class="menuTitle">{{ t('dock.servers.heading') }}</DropdownMenuLabel>
            <p v-if="list?.problem" class="px-2 pb-1 text-danger">{{ t('dock.servers.invalid') }}</p>
            <p v-else-if="list && !list.servers.length" class="px-2 pb-1 text-muted">{{ t('dock.servers.none') }}</p>
            <template v-for="server in list?.servers ?? []" :key="server.name">
              <UiMenuItem v-if="server.external" :label="t('dock.servers.external', { name: server.name })" :icon="dot('stopped')" disabled />
              <UiMenuSub v-else :label="server.name" :icon="dot(server.status)" :value="state(server)">
                <UiMenuItem v-if="alive(server)" :label="t('dock.servers.open')" :icon="Globe" @select="start(server)" />
                <UiMenuItem v-if="!alive(server)" :label="t('dock.servers.start')" :icon="Play" @select="start(server)" />
                <UiMenuItem :label="t('dock.servers.logs')" :icon="Logs" @select="servers.show(list!.root, server.name)" />
                <UiMenuItem v-if="alive(server)" :label="t('dock.servers.stop')" :icon="Stop" danger @select="servers.stop(list!.root, server.name)" />
              </UiMenuSub>
            </template>
            <template v-if="list">
              <UiMenuSeparator />
              <UiMenuItem v-if="list.problem" :label="t('dock.servers.fix')" :icon="Wrench" @select="ask" />
              <UiMenuItem v-else :label="t('dock.servers.add')" :icon="Plus" @select="ask" />
              <UiMenuItem v-if="list.servers.length" :label="t('dock.servers.stopAll')" :icon="Stop" danger :disabled="!running" @select="servers.stopAll(list.root)" />
            </template>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
