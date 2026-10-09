<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDock from '@/components/shell/ShellDock.vue'
import ShellConversations from '@/components/shell/ShellConversations.vue'
import ShellRail from '@/components/shell/ShellRail.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import ShellTitleBar from '@/components/shell/ShellTitleBar.vue'
import { SIZES, useLayoutStore } from '@/stores/layout'
import { useWorkspaceStore } from '@/stores/workspace'
import { matchesShortcut, type Shortcut, shortcuts } from '@/utils/shortcuts'
import WorkspaceView from '@/views/WorkspaceView.vue'

// ===== Initialisation =====
const { t } = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()

const showBottomDock = computed(() => layout.bottom.open && layout.viewsIn('bottom').length > 0)
const showRightDock = computed(() => layout.right.open && layout.viewsIn('right').length > 0)

const actions: [Shortcut, () => void][] = [
  [shortcuts.toggleRail, layout.toggleRail],
  [shortcuts.toggleConversations, layout.toggleConversations],
  [shortcuts.toggleRightDock, () => layout.toggleDock('right')],
  [shortcuts.toggleBottomDock, () => layout.toggleDock('bottom')],
  [shortcuts.newChat, workspace.openChat],
  [shortcuts.closeTab, workspace.closeActiveTab],
  [shortcuts.split, workspace.split],
]

function onKeydown(event: KeyboardEvent) {
  const action = actions.find(([shortcut]) => matchesShortcut(event, shortcut))
  if (!action) return
  event.preventDefault()
  action[1]()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  workspace.openChat()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <h1 class="sr-only">Nuée</h1>
  <div class="flex h-full">
    <template v-if="layout.rail.open">
      <ShellRail :style="{ width: `${layout.rail.width}px` }" />
      <ShellResizeHandle
        v-model="layout.rail.width"
        v-bind="SIZES.rail"
        orientation="vertical"
        :label="t('shell.resizeRail')"
      />
    </template>
    <template v-if="layout.conversations.open">
      <ShellConversations :style="{ width: `${layout.conversations.width}px` }" />
      <ShellResizeHandle
        v-model="layout.conversations.width"
        v-bind="SIZES.conversations"
        orientation="vertical"
        :label="t('shell.resizeConversations')"
      />
    </template>

    <div class="flex min-w-0 flex-1 flex-col bg-canvas macos:bg-canvas/70">
      <ShellTitleBar />
      <div class="flex min-h-0 flex-1">
        <div class="flex min-w-0 flex-1 flex-col">
          <main class="min-h-0 flex-1">
            <WorkspaceView />
          </main>
          <template v-if="showBottomDock">
            <ShellResizeHandle
              v-model="layout.bottom.size"
              v-bind="SIZES.bottom"
              orientation="horizontal"
              invert
              :label="t('dock.resize')"
            />
            <ShellDock position="bottom" :style="{ height: `${layout.bottom.size}px` }" />
          </template>
        </div>
        <template v-if="showRightDock">
          <ShellResizeHandle
            v-model="layout.right.size"
            v-bind="SIZES.right"
            orientation="vertical"
            invert
            :label="t('dock.resize')"
          />
          <ShellDock position="right" :style="{ width: `${layout.right.size}px` }" />
        </template>
      </div>
    </div>
  </div>
</template>
