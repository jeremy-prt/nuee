<script setup lang="ts">
import { Logs, Play, Server, Stop } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ServerStatusDot from '@/components/server/ServerStatusDot.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ServerInfo } from '@/ipc/bindings/ServerInfo'
import { useServersStore } from '@/stores/servers'

// Volet Navigateur sans page : une carte par serveur du projet, comme l'app Claude.
const { t } = useI18n()
const servers = useServersStore()
const { chat, place } = useTerminalChat()

const list = computed(() => (chat.value ? servers.listOf(chat.value.id) : null))
const launchable = computed(() => list.value?.servers.filter((server) => !server.external) ?? [])
const alive = (server: ServerInfo) => server.status === 'starting' || server.status === 'running'

function toggle(server: ServerInfo) {
  if (!list.value) return
  if (alive(server)) servers.stop(list.value.root, server.name)
  else if (chat.value && place.value) servers.start(chat.value.id, place.value, server.name)
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-6">
    <ul class="flex w-full max-w-72 flex-col gap-2" :aria-label="t('dock.servers.heading')">
      <li
        v-for="server in launchable"
        :key="server.name"
        class="flex items-center gap-3 rounded-xl border border-stroke py-2 ps-3.5 pe-2 text-sm"
      >
        <Server v-if="server.status === 'stopped'" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        <ServerStatusDot v-else :status="server.status" class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-content/85">{{ server.name }}</span>
        <span class="shrink-0 text-muted">:{{ server.activePort ?? server.port }}</span>
        <UiIconButton v-if="server.status !== 'stopped'" :label="t('dock.servers.logs')" @click="list && servers.show(list.root, server.name)">
          <Logs class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          :label="alive(server) ? t('dock.servers.stopNamed', { name: server.name }) : t('dock.servers.startNamed', { name: server.name })"
          class="size-8! bg-selection text-content! hover:bg-selection-inner!"
          @click="toggle(server)"
        >
          <Stop v-if="alive(server)" class="size-4" aria-hidden="true" />
          <Play v-else class="size-4" aria-hidden="true" />
        </UiIconButton>
      </li>
    </ul>
  </div>
</template>
