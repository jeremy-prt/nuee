<script setup lang="ts">
import { Plus, X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatChangesPanel from '@/components/chat/ChatChangesPanel.vue'
import ChatSessionPanel from '@/components/chat/ChatSessionPanel.vue'
import ChatTasks from '@/components/chat/ChatTasks.vue'
import ServerCards from '@/components/server/ServerCards.vue'
import ServerLogs from '@/components/server/ServerLogs.vue'
import ServerMenu from '@/components/server/ServerMenu.vue'
import TerminalPanel from '@/components/terminal/TerminalPanel.vue'
import TerminalTabs from '@/components/terminal/TerminalTabs.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useServersStore } from '@/stores/servers'
import { useTerminalsStore } from '@/stores/terminals'

// Un volet du panneau de droite : son titre (les onglets des shells pour le terminal), puis son contenu.
const props = defineProps<{ view: DockView }>()

const { t } = useI18n()
const layout = useLayoutStore()
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
    <div class="flex h-9 shrink-0 items-center gap-0.5 border-b border-stroke ps-3 pe-2">
      <TerminalTabs v-if="view === 'terminal' && shells > 1" class="-ms-1" />
      <h2 v-else class="flex min-w-0 items-center gap-1.5 text-xs text-content">
        <component :is="dockIcons[view]" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span class="truncate">{{ t(`dock.${view}.title`) }}</span>
      </h2>
      <UiIconButton v-if="view === 'terminal' && chat" :label="t('dock.terminal.new')" @click="newTerminal">
        <Plus class="size-4" aria-hidden="true" />
      </UiIconButton>
      <span class="flex-1" />
      <ServerMenu v-if="view === 'browser'" />
      <!-- Seul, le volet se ferme avec le bouton du panneau : la croix ne sert qu'à retirer l'un de deux volets empilés. -->
      <UiIconButton v-if="layout.right.panes.length > 1" :label="t('dock.close')" @click="layout.hideView(props.view)">
        <X class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>
    <ChatSessionPanel v-if="view === 'session'" />
    <ChatTasks v-else-if="view === 'tasks'" />
    <ChatChangesPanel v-else-if="view === 'changes'" />
    <TerminalPanel v-else-if="view === 'terminal'" />
    <ServerLogs v-else-if="view === 'browser' && logs" :root="logs.root" :name="logs.name" />
    <ServerCards v-else-if="view === 'browser' && chat" />
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <component :is="dockIcons[view]" class="size-6 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">{{ t(`dock.${view}.empty`) }}</p>
    </div>
  </section>
</template>
