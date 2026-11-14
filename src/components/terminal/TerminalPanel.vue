<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import { Columns2, Eraser, Plus, SplitDown, SquareTerminal, X } from '@/components/ui/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDockToolbar from '@/components/shell/ShellDockToolbar.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import { useShortcutsStore } from '@/stores/shortcuts'
import { MAX_SPLIT, type SplitDirection, useTerminalsStore } from '@/stores/terminals'

// Les shells de l'onglet choisi, côte à côte ou empilés (split, comme iTerm et T3 Code). ⌘D et ⌘⇧D partagent la zone
// quand le terminal a le focus : ils passent avant le ⌘D de la fenêtre (vue partagée des sessions).
const { t } = useI18n()
const terminals = useTerminalsStore()
const shortcuts = useShortcutsStore()
const { chat, place } = useTerminalChat()
// Shell seul à son invite : le dossier où il travaille, sinon le nom des sessions sans projet. Jamais « Terminal »,
// déjà écrit sur l'onglet du volet.
const labels = useTerminalLabels(() => (place.value?.worktreePath ?? place.value?.cwd)?.split(/[\\/]/).filter(Boolean).pop() ?? t('rail.chats'))
const area = useTemplateRef('area')

const list = computed(() => (chat.value ? terminals.tabsOf(chat.value.id) : []))
const activeKey = computed(() => (chat.value ? (terminals.active[chat.value.id] ?? null) : null))
const group = computed(() => {
  if (!chat.value) return null
  const groups = terminals.groupsOf(chat.value.id)
  return groups.find((item) => item.shells.some((shell) => shell.key === activeKey.value)) ?? groups[0] ?? null
})

function create() {
  if (chat.value && place.value) terminals.create(chat.value.id, place.value)
}

// Une session sans terminal en reçoit un à l'ouverture du volet ; fermer le dernier laisse le volet vide. En arrivant
// sur une session dont le volet est déjà affiché (disposition du projet), le shell ne prend pas le focus, et une
// session vierge n'en reçoit pas : son dossier (worktree, dossier temporaire) n'est fixé qu'au premier message.
function ensureShell() {
  const tab = chat.value
  if (!tab || !place.value || terminals.tabsOf(tab.id).length) return
  if (terminals.wantsFocus) create()
  else if (tab.started) terminals.create(tab.id, place.value, undefined, false)
}

watch(
  () => chat.value?.id,
  async () => {
    await nextTick()
    ensureShell()
  },
)

function split(direction: SplitDirection) {
  if (chat.value && place.value) terminals.split(chat.value.id, place.value, direction)
}

function choose(key: string) {
  if (!chat.value) return
  terminals.active[chat.value.id] = key
  terminals.focus(key)
}

function bind(key: string, element: unknown) {
  if (element instanceof HTMLElement) terminals.attach(key, element)
}

function fitAll() {
  for (const shell of group.value?.shells ?? []) terminals.fit(shell.key)
}

watch(
  [() => terminals.wantsFocus, activeKey],
  async ([wanted, key]) => {
    if (!wanted || !key) return
    await nextTick()
    terminals.focus(key)
    terminals.wantsFocus = false
  },
  { immediate: true },
)

watch(() => group.value?.shells.length, () => nextTick(fitAll))

function onKeydown(event: KeyboardEvent) {
  if (!chat.value || !place.value) return
  const direction = shortcuts.matches(event, 'splitTerminal') ? 'right' : shortcuts.matches(event, 'splitTerminalDown') ? 'down' : null
  if (!direction) return
  event.preventDefault()
  event.stopPropagation()
  split(direction)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  ensureShell()
  if (!area.value) return
  observer = new ResizeObserver(fitAll)
  observer.observe(area.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <UiEmpty v-if="!chat" :icon="SquareTerminal" :title="t('dock.terminal.emptyTitle')" :description="t('dock.terminal.noSession')" />
  <div v-else class="flex min-h-0 flex-1 flex-col">
    <!-- Comme T3 Code et VS Code : les shells de l'onglet à gauche, les actions à droite. -->
    <ShellDockToolbar :label="t('dock.terminal.title')">
      <div
        v-for="shell in group?.shells ?? []"
        :key="shell.key"
        class="group/shell relative flex h-7 max-w-36 min-w-0 shrink items-center rounded-md text-xs"
        :class="shell.key === activeKey ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
      >
        <button
          type="button"
          class="flex h-full min-w-0 items-center gap-1.5 rounded-md ps-2 focus-visible:outline-2 focus-visible:outline-ring"
          :class="group && group.shells.length > 1 ? 'pe-6' : 'pe-2'"
          :aria-pressed="shell.key === activeKey"
          @click="choose(shell.key)"
        >
          <SquareTerminal class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ labels[shell.key] }}</span>
        </button>
        <button
          v-if="group && group.shells.length > 1"
          type="button"
          class="absolute end-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted opacity-0 group-hover/shell:opacity-100 hover:bg-selection-inner hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('dock.terminal.closeShell', { name: labels[shell.key] ?? '' })"
          @click="terminals.close(chat.id, shell.key)"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>
      <template #end>
        <UiIconButton :label="t('dock.terminal.new')" :disabled="!place" @click="create">
          <Plus class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          :label="t('dock.terminal.splitRight')"
          :shortcut="shortcuts.label('splitTerminal')"
          :disabled="!place || (group?.shells.length ?? 0) >= MAX_SPLIT"
          @click="split('right')"
        >
          <Columns2 class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          :label="t('dock.terminal.splitDown')"
          :shortcut="shortcuts.label('splitTerminalDown')"
          :disabled="!place || (group?.shells.length ?? 0) >= MAX_SPLIT"
          @click="split('down')"
        >
          <SplitDown class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton :label="t('dock.terminal.clear')" :disabled="!activeKey" @click="activeKey && terminals.clear(activeKey)">
          <Eraser class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </template>
    </ShellDockToolbar>
    <div
      ref="area"
      class="relative flex min-h-0 flex-1"
      :class="group?.direction === 'down' ? 'flex-col' : 'flex-row'"
      @keydown.capture="onKeydown"
    >
      <div
        v-for="(shell, index) in group?.shells ?? []"
        :key="shell.key"
        class="relative min-h-0 min-w-0 flex-1"
        :class="index > 0 && (group?.direction === 'down' ? 'border-t border-stroke' : 'border-s border-stroke')"
        @focusin="terminals.active[chat.id] = shell.key"
      >
        <div :ref="(element) => bind(shell.key, element)" class="terminal-host absolute inset-0 p-2 pe-1" />
      </div>
      <UiEmpty v-if="!list.length" :icon="SquareTerminal" :title="t('dock.terminal.emptyTitle')" :description="t('dock.terminal.empty')" class="absolute inset-0">
        <UiButton size="sm" @click="create">
          <Plus class="size-3.5" aria-hidden="true" />
          {{ t('dock.terminal.new') }}
        </UiButton>
      </UiEmpty>
    </div>
  </div>
</template>

<style scoped>
/* xterm.css peint la zone de défilement en noir : le fond du volet doit rester visible (transparence). */
.terminal-host :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
