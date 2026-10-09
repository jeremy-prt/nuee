<script setup lang="ts">
import { MessageSquare, PanelLeftClose, SquarePen } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useLayoutStore } from '@/stores/layout'
import { useWorkspaceStore } from '@/stores/workspace'
import { shortcutLabel, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
</script>

<template>
  <aside
    id="shell-conversations"
    class="flex shrink-0 flex-col bg-canvas macos:bg-canvas/40"
    :aria-label="t('shell.conversations')"
  >
    <div class="flex h-10 shrink-0 items-center gap-1 px-2" data-tauri-drag-region>
      <!-- Barre des projets repliée : ce panneau devient le premier, il reprend la place des boutons de fenêtre. -->
      <template v-if="!layout.rail.open">
        <div class="w-0 shrink-0 macos:w-[68px]" />
        <ShellRailToggle />
      </template>
      <p class="min-w-0 flex-1 truncate px-1 text-sm font-medium">{{ t('shell.conversations') }}</p>
      <UiIconButton
        :label="t('shell.newChat')"
        :shortcut="shortcutLabel(shortcuts.newChat)"
        @click="workspace.openChat()"
      >
        <SquarePen class="size-4" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton
        :label="t('shell.toggleConversations')"
        :shortcut="shortcutLabel(shortcuts.toggleConversations)"
        aria-controls="shell-conversations"
        :aria-expanded="layout.conversations.open"
        @click="layout.toggleConversations()"
      >
        <PanelLeftClose class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <ul v-if="workspace.tabs.length" class="space-y-0.5">
        <li v-for="tab in workspace.tabs" :key="tab.id">
          <button
            type="button"
            class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
            :class="tab.id === workspace.activeTabId ? 'bg-selection' : 'hover:bg-selection-hover'"
            :aria-current="tab.id === workspace.activeTabId ? 'true' : undefined"
            @click="workspace.show(tab.id)"
          >
            <MessageSquare class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="truncate">{{ t('workspace.chatTitle', { n: tab.number }) }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="px-2 text-sm text-muted">{{ t('shell.noConversations') }}</p>
    </div>
  </aside>
</template>
