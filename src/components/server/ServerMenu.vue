<script setup lang="ts">
import { Ellipsis, Logs, Play, Stop } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { type Component, computed, h, watch } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import ServerStatusDot from '@/components/server/ServerStatusDot.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import type { ServerStatus } from '@/ipc/bindings/ServerStatus'
import { useServersStore } from '@/stores/servers'

// Menu Serveurs de l'en-tête du volet Navigateur, comme « Dev servers » dans l'app Claude.
const { t } = useI18n()
const servers = useServersStore()
const { chat, place } = useTerminalChat()

const list = computed(() => (chat.value ? servers.listOf(chat.value.id) : null))
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

// Relu à l'ouverture du menu : le fichier a pu changer entre-temps.
watch(() => chat.value?.id, refresh, { immediate: true })

function onOpen(open: boolean) {
  if (open) refresh()
}

function start(name: string) {
  if (chat.value && place.value) servers.start(chat.value.id, place.value, name)
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
        <!-- Une seule icône dans l'en-tête, comme le menu ⋯ de l'app Claude : les actions du volet s'y rangent. -->
        <DropdownMenuTrigger
          :disabled="!chat"
          class="relative grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="running ? t('dock.servers.menuRunning', { n: running }) : t('dock.servers.menu')"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <Ellipsis class="size-4" aria-hidden="true" />
          <span v-if="running" class="absolute end-1 top-1 size-1.5 rounded-full bg-success" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            :collision-padding="8"
            :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-64']"
            @close-auto-focus="onCloseAutoFocus"
          >
            <DropdownMenuLabel :class="menuTitle">{{ t('dock.servers.heading') }}</DropdownMenuLabel>
            <p v-if="!list" class="px-2 pb-1.5 text-muted">{{ t('dock.servers.loading') }}</p>
            <p v-else-if="list.problem" class="px-2 pb-1.5 text-muted">
              <span class="block text-danger">{{ t('dock.servers.invalid') }}</span>
              <span class="block font-mono text-[11px] break-words">{{ list.problem }}</span>
            </p>
            <Translation v-else-if="!list.servers.length" keypath="dock.servers.none" tag="p" class="px-2 pb-1.5 text-muted">
              <template #file><span class="font-mono">.claude/launch.json</span></template>
            </Translation>
            <template v-for="server in list?.servers ?? []" :key="server.name">
              <UiMenuItem v-if="server.external" :label="t('dock.servers.external', { name: server.name })" :icon="dot('stopped')" disabled />
              <UiMenuSub v-else :label="server.name" :icon="dot(server.status)" :value="state(server)">
                <UiMenuItem v-if="alive(server)" :label="t('dock.servers.stop')" :icon="Stop" @select="servers.stop(list!.root, server.name)" />
                <UiMenuItem v-else :label="t('dock.servers.start')" :icon="Play" @select="start(server.name)" />
                <UiMenuItem :label="t('dock.servers.logs')" :icon="Logs" @select="servers.show(list!.root, server.name)" />
              </UiMenuSub>
            </template>
            <template v-if="list?.servers.length">
              <UiMenuSeparator />
              <UiMenuItem :label="t('dock.servers.stopAll')" :icon="Stop" :disabled="!running" @select="servers.stopAll(list.root)" />
            </template>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
