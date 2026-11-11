<script setup lang="ts">
import { computed, defineAsyncComponent, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BrowserPane from '@/components/browser/BrowserPane.vue'
import GitPanel from '@/components/git/GitPanel.vue'
import ChatTasks from '@/components/chat/ChatTasks.vue'
import ServerLogs from '@/components/server/ServerLogs.vue'
import TerminalPanel from '@/components/terminal/TerminalPanel.vue'
import ShellDockLauncher from '@/components/shell/ShellDockLauncher.vue'
import ShellDockZoneClose from '@/components/shell/ShellDockZoneClose.vue'
import { DOCK_ZONE } from '@/components/shell/ShellDockToolbar.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { type DockView, type DockZone, useLayoutStore } from '@/stores/layout'
import { useServersStore } from '@/stores/servers'

// Le volet affiché du panneau de droite, ou le lanceur si aucun n'est choisi. Ses onglets (pages, shells) sont au-dessus.
const props = defineProps<{ view: DockView | null; zone: DockZone }>()

// Chargé à la première ouverture : l'éditeur (CodeMirror) n'alourdit pas le démarrage.
const FilesPanel = defineAsyncComponent(() => import('@/components/files/FilesPanel.vue'))

const { t } = useI18n()
const servers = useServersStore()
const layout = useLayoutStore()
const { chat } = useTerminalChat()
const toolbars = ref(0)
provide(DOCK_ZONE, { zone: computed(() => props.zone), toolbars })

// Clic ou focus dans une zone : c'est là que s'affichera le prochain volet choisi.
function enter() {
  layout.zone = props.zone
}

// Les logs ouverts ne restent affichés que pour les sessions du même dossier.
const logs = computed(() => {
  const viewing = servers.viewing
  const list = chat.value ? servers.listOf(chat.value.id) : null
  return viewing && list?.root === viewing.root ? viewing : null
})
</script>

<template>
  <ShellDockLauncher v-if="!view" />
  <section
    v-else
    class="relative flex min-h-0 min-w-0 flex-col"
    :aria-label="t(`dock.${view}.title`)"
    :data-dock-view="view"
    @pointerdown.capture="enter"
    @focusin="enter"
  >
    <ChatTasks v-if="view === 'tasks'" />
    <GitPanel v-else-if="view === 'changes'" />
    <TerminalPanel v-else-if="view === 'terminal'" />
    <FilesPanel v-else-if="view === 'files'" />
    <ServerLogs v-else-if="view === 'browser' && logs" :root="logs.root" :name="logs.name" />
    <BrowserPane v-else-if="view === 'browser' && chat" />
    <UiEmpty v-else :icon="dockIcons[view]" :title="t('dock.files.emptyTitle')" :description="t('dock.files.empty')" />
    <!-- Volet sans ligne d'outils (état vide) : sa croix se pose à la même place. -->
    <ShellDockZoneClose v-if="layout.right.aside && !toolbars" :zone="zone" class="absolute end-1.5 top-1" />
  </section>
</template>
