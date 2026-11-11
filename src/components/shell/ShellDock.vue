<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import BrowserPane from '@/components/browser/BrowserPane.vue'
import ChatChangesPanel from '@/components/chat/ChatChangesPanel.vue'
import ChatTasks from '@/components/chat/ChatTasks.vue'
import ServerLogs from '@/components/server/ServerLogs.vue'
import TerminalPanel from '@/components/terminal/TerminalPanel.vue'
import ShellDockLauncher from '@/components/shell/ShellDockLauncher.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { DockView } from '@/stores/layout'
import { useServersStore } from '@/stores/servers'

// Le volet affiché du panneau de droite, ou le lanceur si aucun n'est choisi. Ses onglets (pages, shells) sont au-dessus.
defineProps<{ view: DockView | null }>()

// Chargé à la première ouverture : l'éditeur (CodeMirror) n'alourdit pas le démarrage.
const FilesPanel = defineAsyncComponent(() => import('@/components/files/FilesPanel.vue'))

const { t } = useI18n()
const servers = useServersStore()
const { chat } = useTerminalChat()

// Les logs ouverts ne restent affichés que pour les sessions du même dossier.
const logs = computed(() => {
  const viewing = servers.viewing
  const list = chat.value ? servers.listOf(chat.value.id) : null
  return viewing && list?.root === viewing.root ? viewing : null
})
</script>

<template>
  <ShellDockLauncher v-if="!view" />
  <section v-else class="flex min-h-0 min-w-0 flex-col" :aria-label="t(`dock.${view}.title`)" :data-dock-view="view">
    <ChatTasks v-if="view === 'tasks'" />
    <ChatChangesPanel v-else-if="view === 'changes'" />
    <TerminalPanel v-else-if="view === 'terminal'" />
    <FilesPanel v-else-if="view === 'files'" />
    <ServerLogs v-else-if="view === 'browser' && logs" :root="logs.root" :name="logs.name" />
    <BrowserPane v-else-if="view === 'browser' && chat" />
    <UiEmpty v-else :icon="dockIcons[view]" :title="t('dock.files.emptyTitle')" :description="t('dock.files.empty')" />
  </section>
</template>
