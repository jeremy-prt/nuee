<script setup lang="ts">
import { Plus } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BrowserMenu from '@/components/browser/BrowserMenu.vue'
import BrowserPane from '@/components/browser/BrowserPane.vue'
import BrowserTabs from '@/components/browser/BrowserTabs.vue'
import ChatChangesPanel from '@/components/chat/ChatChangesPanel.vue'
import ChatSessionPanel from '@/components/chat/ChatSessionPanel.vue'
import ChatTasks from '@/components/chat/ChatTasks.vue'
import ServerLogs from '@/components/server/ServerLogs.vue'
import ServerMenu from '@/components/server/ServerMenu.vue'
import TerminalPanel from '@/components/terminal/TerminalPanel.vue'
import TerminalTabs from '@/components/terminal/TerminalTabs.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { DockView } from '@/stores/layout'
import { useServersStore } from '@/stores/servers'
import { useTerminalsStore } from '@/stores/terminals'

// Le volet affiché du panneau de droite : ses outils (shells du terminal, serveurs du navigateur), puis son contenu.
defineProps<{ view: DockView }>()

const { t } = useI18n()
const terminals = useTerminalsStore()
const servers = useServersStore()
const { chat, place } = useTerminalChat()

// Les logs ouverts ne restent affichés que pour les sessions du même dossier.
const logs = computed(() => {
  const viewing = servers.viewing
  const list = chat.value ? servers.listOf(chat.value.id) : null
  return viewing && list?.root === viewing.root ? viewing : null
})

const shells = computed(() => (chat.value ? terminals.tabsOf(chat.value.id).length : 0))

function newTerminal() {
  if (chat.value && place.value) terminals.create(chat.value.id, place.value)
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col" :aria-label="t(`dock.${view}.title`)">
    <!-- Le nom du volet est dans son onglet, au-dessus : l'en-tête ne garde que les outils du terminal et du navigateur. -->
    <div v-if="view === 'terminal' || view === 'browser'" class="flex h-9 shrink-0 items-center gap-0.5 border-b border-stroke ps-2 pe-3.5">
      <TerminalTabs v-if="view === 'terminal' && shells > 0" />
      <BrowserTabs v-if="view === 'browser'" />
      <UiIconButton v-if="view === 'terminal' && chat" :label="t('dock.terminal.new')" @click="newTerminal">
        <Plus class="size-4" aria-hidden="true" />
      </UiIconButton>
      <span class="flex-1" />
      <template v-if="view === 'browser'">
        <ServerMenu />
        <BrowserMenu />
      </template>
    </div>
    <ChatSessionPanel v-if="view === 'session'" />
    <ChatTasks v-else-if="view === 'tasks'" />
    <ChatChangesPanel v-else-if="view === 'changes'" />
    <TerminalPanel v-else-if="view === 'terminal'" />
    <ServerLogs v-else-if="view === 'browser' && logs" :root="logs.root" :name="logs.name" />
    <BrowserPane v-else-if="view === 'browser' && chat" />
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <component :is="dockIcons[view]" class="size-6 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">{{ t(`dock.${view}.empty`) }}</p>
    </div>
  </section>
</template>
