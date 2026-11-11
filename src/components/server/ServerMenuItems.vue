<script setup lang="ts">
import { Globe, Logs, Play, Plus, Stop, Wrench } from '@/components/ui/icons'
import { DropdownMenuLabel } from 'reka-ui'
import { type Component, h } from 'vue'
import { useI18n } from 'vue-i18n'
import ServerStatusDot from '@/components/server/ServerStatusDot.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { menuTitle } from '@/components/ui/menuRow'
import { useServerSetup } from '@/composables/useServerSetup'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import type { ServerStatus } from '@/ipc/bindings/ServerStatus'
import { useBrowserStore } from '@/stores/browser'
import { useServersStore } from '@/stores/servers'

// Contenu du menu Serveurs, sous le bouton du volet Navigateur comme dans la ligne d'Environnement.
defineProps<{ running: number }>()
const { t } = useI18n()
const servers = useServersStore()
const browser = useBrowserStore()
const { chat, place } = useTerminalChat()
const { list, ask } = useServerSetup()

const alive = (server: ServerInfo) => server.status === 'starting' || server.status === 'running'

const dots = new Map<ServerStatus, Component>()
const dot = (status: ServerStatus) => {
  if (!dots.has(status)) dots.set(status, () => h(ServerStatusDot, { status }))
  return dots.get(status)!
}

function state(server: ServerInfo) {
  if (server.status === 'starting') return t('dock.servers.status.starting')
  if (alive(server)) return `:${server.activePort ?? server.port}`
  if (server.status === 'exited') return t('dock.servers.status.exited')
  return t('dock.servers.status.stopped')
}

// Comme ▶ dans le volet : le serveur démarre et sa page s'ouvre.
function start(server: ServerInfo) {
  if (chat.value && place.value) browser.openServer(chat.value.id, place.value, server)
}
</script>

<template>
  <!-- Sans serveur, le titre répéterait la ligne qui a ouvert le menu : l'état vide seul. -->
  <DropdownMenuLabel v-if="list?.problem || list?.servers.length" :class="menuTitle">{{ t('dock.servers.heading') }}</DropdownMenuLabel>
  <p v-if="list?.problem" class="px-2 pb-1 text-danger">{{ t('dock.servers.invalid') }}</p>
  <p v-else-if="list && !list.servers.length" class="px-2 py-1 text-[13px] text-muted">{{ t('dock.servers.none') }}</p>
  <template v-for="server in list?.servers ?? []" :key="server.name">
    <UiMenuItem v-if="server.external" :label="t('dock.servers.external', { name: server.name })" :icon="dot('stopped')" disabled />
    <UiMenuSub v-else :label="server.name" :icon="dot(server.status)" :value="state(server)">
      <UiMenuItem v-if="alive(server)" :label="t('dock.servers.open')" :icon="Globe" @select="start(server)" />
      <UiMenuItem v-if="!alive(server)" :label="t('dock.servers.start')" :icon="Play" @select="start(server)" />
      <UiMenuItem :label="t('dock.servers.logs')" :icon="Logs" @select="servers.show(list!.root, server.name)" />
      <UiMenuItem v-if="alive(server)" :label="t('dock.servers.stop')" :icon="Stop" @select="servers.stop(list!.root, server.name)" />
    </UiMenuSub>
  </template>
  <template v-if="list">
    <UiMenuSeparator />
    <UiMenuItem v-if="list.problem" :label="t('dock.servers.fix')" :icon="Wrench" @select="ask" />
    <UiMenuItem v-else :label="t('dock.servers.add')" :icon="Plus" @select="ask" />
    <UiMenuItem v-if="list.servers.length" :label="t('dock.servers.stopAll')" :icon="Stop" danger :disabled="!running" @select="servers.stopAll(list.root)" />
  </template>
</template>
