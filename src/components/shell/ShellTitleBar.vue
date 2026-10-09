<script setup lang="ts">
import { Columns2, MessageSquare, MessagesSquare, PanelBottom, PanelRight, Plus, X } from '@lucide/vue'
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
  <header
    class="flex h-10 shrink-0 items-center gap-1 border-b border-stroke px-2"
    data-tauri-drag-region
  >
    <!-- Les deux panneaux de gauche repliés : la barre de titre reprend la place des boutons de fenêtre. -->
    <template v-if="!layout.rail.open && !layout.conversations.open">
      <div class="w-0 shrink-0 macos:w-[68px]" />
      <ShellRailToggle />
    </template>
    <UiIconButton
      v-if="!layout.conversations.open"
      :label="t('shell.toggleConversations')"
      :shortcut="shortcutLabel(shortcuts.toggleConversations)"
      aria-controls="shell-conversations"
      :aria-expanded="false"
      @click="layout.toggleConversations()"
    >
      <MessagesSquare class="size-4" aria-hidden="true" />
    </UiIconButton>

    <div
      role="tablist"
      :aria-label="t('workspace.tabs')"
      class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto ps-1"
      data-tauri-drag-region
    >
      <div
        v-for="tab in workspace.tabs"
        :key="tab.id"
        role="tab"
        tabindex="0"
        :aria-selected="tab.id === workspace.activeTabId"
        class="group flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-md ps-2 pe-1 text-xs focus-visible:outline-2 focus-visible:outline-accent"
        :class="
          tab.id === workspace.activeTabId
            ? 'bg-selection text-content'
            : 'text-muted hover:bg-selection-hover hover:text-content'
        "
        @click="workspace.show(tab.id)"
        @keydown.enter.prevent="workspace.show(tab.id)"
        @keydown.space.prevent="workspace.show(tab.id)"
        @auxclick.middle="workspace.closeTab(tab.id)"
      >
        <MessageSquare class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ t('workspace.chatTitle', { n: tab.number }) }}</span>
        <button
          type="button"
          tabindex="-1"
          class="grid size-5 shrink-0 place-items-center rounded group-hover:opacity-100 hover:bg-selection-hover"
          :class="tab.id === workspace.activeTabId ? 'opacity-100' : 'opacity-0'"
          :aria-label="t('workspace.closeTab')"
          :title="`${t('workspace.closeTab')} (${shortcutLabel(shortcuts.closeTab)})`"
          @click.stop="workspace.closeTab(tab.id)"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>

      <UiIconButton
        :label="t('shell.newChat')"
        :shortcut="shortcutLabel(shortcuts.newChat)"
        @click="workspace.openChat()"
      >
        <Plus class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>

    <UiIconButton
      :label="t('workspace.split')"
      :shortcut="shortcutLabel(shortcuts.split)"
      :disabled="workspace.panes.length !== 1"
      @click="workspace.split()"
    >
      <Columns2 class="size-4" aria-hidden="true" />
    </UiIconButton>
    <UiIconButton
      v-if="layout.viewsIn('bottom').length"
      :label="t('dock.toggleBottom')"
      :shortcut="shortcutLabel(shortcuts.toggleBottomDock)"
      :active="layout.bottom.open"
      :aria-expanded="layout.bottom.open"
      @click="layout.toggleDock('bottom')"
    >
      <PanelBottom class="size-4" aria-hidden="true" />
    </UiIconButton>
    <UiIconButton
      v-if="layout.viewsIn('right').length"
      :label="t('dock.toggleRight')"
      :shortcut="shortcutLabel(shortcuts.toggleRightDock)"
      :active="layout.right.open"
      :aria-expanded="layout.right.open"
      @click="layout.toggleDock('right')"
    >
      <PanelRight class="size-4" aria-hidden="true" />
    </UiIconButton>
  </header>
</template>
