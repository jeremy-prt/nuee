<script setup lang="ts">
import { Columns2, LoaderCircle, SplitDown, X } from '@/components/ui/icons'
import { type Component, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellDockMenu from '@/components/shell/ShellDockMenu.vue'
import { dockIcons } from '@/components/shell/dockIcons'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import { useBrowserStore } from '@/stores/browser'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'

// Onglets du panneau de droite, comme T3 Code : un par volet ouvert, un par page pour le navigateur et un par groupe de
// shells pour le terminal (pas de seconde barre dans le volet). La croix au survol, à droite comme les onglets de
// session ; au clavier, Suppr ferme l'onglet qui a le focus ; clic droit pour fermer, ou diviser un terminal.
interface Item {
  key: string
  view: DockView
  label: string
  icon: Component
  loading: boolean
  page: BrowserTab | null
  // Groupe de shells d'un onglet du terminal.
  group: string | null
}

const { t } = useI18n()
const layout = useLayoutStore()
const browser = useBrowserStore()
const terminals = useTerminalsStore()
const shortcuts = useShortcutsStore()
const { chat, place } = useTerminalChat()
const shellLabels = useTerminalLabels()

function pageLabel(page: BrowserTab) {
  if (page.title) return page.title
  try {
    const url = new URL(page.url)
    return url.protocol === 'about:' ? t('dock.browser.newTab') : url.host
  } catch {
    return page.url
  }
}

const items = computed<Item[]>(() =>
  layout.right.tabs.flatMap((view): Item[] => {
    const pages = view === 'browser' && chat.value ? browser.tabsOf(chat.value.id) : []
    if (pages.length) {
      return pages.map((page) => ({ key: page.id, view, label: pageLabel(page), icon: dockIcons.browser, loading: page.loading, page, group: null }))
    }
    const groups = view === 'terminal' && chat.value ? terminals.groupsOf(chat.value.id) : []
    if (groups.length) {
      return groups.map(({ group, shells, direction }) => {
        const shown = shells.find((shell) => shell.key === terminals.active[chat.value!.id]) ?? shells[0]!
        const icon = shells.length < 2 ? dockIcons.terminal : direction === 'down' ? SplitDown : Columns2
        return { key: group, view, label: shellLabels.value[shown.key] ?? t('dock.terminal.title'), icon, loading: false, page: null, group }
      })
    }
    return [{ key: view, view, label: t(`dock.${view}.title`), icon: dockIcons[view], loading: false, page: null, group: null }]
  }),
)

function isActive(item: Item) {
  if (layout.right.active !== item.view || !chat.value) return false
  if (item.page) return browser.active[chat.value.id] === item.page.id
  if (item.group) return groupOfActive() === item.group
  return true
}

function groupOfActive() {
  if (!chat.value) return null
  return terminals.tabsOf(chat.value.id).find((shell) => shell.key === terminals.active[chat.value!.id])?.group ?? null
}

function shellsOf(group: string) {
  return chat.value ? terminals.tabsOf(chat.value.id).filter((shell) => shell.group === group) : []
}

function select(item: Item) {
  if (item.page && chat.value) browser.select(chat.value.id, item.page.id)
  const shell = item.group && groupOfActive() !== item.group ? shellsOf(item.group)[0] : null
  if (shell && chat.value) terminals.active[chat.value.id] = shell.key
  layout.showView(item.view)
  if (item.group && chat.value) {
    const key = terminals.active[chat.value.id]
    if (key) nextTick(() => terminals.focus(key))
  }
}

function split(item: Item, direction: 'right' | 'down') {
  if (!chat.value || !place.value) return
  select(item)
  terminals.split(chat.value.id, place.value, direction)
}

// Fermer la dernière page ou le dernier shell ferme aussi le volet.
async function close(item: Item) {
  const chatId = chat.value?.id
  if (item.page && chatId) {
    const last = browser.tabsOf(chatId).length <= 1
    browser.close(item.page.id)
    if (last) layout.closeView('browser')
  } else if (item.group && chatId) {
    for (const shell of shellsOf(item.group)) await terminals.close(chatId, shell.key)
    if (!terminals.tabsOf(chatId).length) layout.closeView('terminal')
  } else {
    layout.closeView(item.view)
  }
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-0.5" role="tablist" :aria-label="t('dock.right')">
    <UiContextMenu
      v-for="item in items"
      :key="item.key"
      class="group/tab relative flex h-7 max-w-36 min-w-0 shrink items-center rounded-md text-xs"
      :class="isActive(item) ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="isActive(item)"
        :title="item.page?.url ?? item.label"
        class="flex h-full min-w-0 items-center gap-1.5 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-ring"
        @click="select(item)"
        @auxclick.middle="close(item)"
        @keydown.delete="close(item)"
        @keydown.backspace="close(item)"
      >
        <span class="relative grid size-3.5 shrink-0 place-items-center" aria-hidden="true">
          <LoaderCircle v-if="item.loading" class="size-3.5 animate-spin motion-reduce:animate-none" />
          <component :is="item.icon" v-else class="size-3.5" />
          <!-- L'agent agit dans cette page : on peut venir regarder, rien ne s'ouvre tout seul. -->
          <span
            v-if="item.page && browser.agent[item.page.id]"
            class="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-signal ring-2 ring-chrome motion-safe:animate-pulse"
          />
        </span>
        <span v-if="item.page && browser.agent[item.page.id]" class="sr-only">{{ t('dock.browser.agentBusy') }}</span>
        <!-- Comme les onglets de session : la croix se pose au survol sur la fin du titre, qui s'estompe. -->
        <span class="truncate group-focus-within/tab:[mask-image:linear-gradient(to_left,transparent_1rem,black_1.375rem)] group-hover/tab:[mask-image:linear-gradient(to_left,transparent_1rem,black_1.375rem)]">{{ item.label }}</span>
      </button>
      <button
        type="button"
        tabindex="-1"
        class="absolute end-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-muted opacity-0 transition-opacity duration-(--hover-duration) group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 hover:bg-selection-inner hover:text-content motion-reduce:transition-none"
        :aria-label="t('dock.closeTab')"
        :title="t('dock.closeTab')"
        @click="close(item)"
      >
        <X class="size-3" aria-hidden="true" />
      </button>
      <template #menu>
        <template v-if="item.view === 'terminal'">
          <UiMenuItem :label="t('dock.terminal.splitRight')" :icon="Columns2" :shortcut="shortcuts.label('splitTerminal')" @select="split(item, 'right')" />
          <UiMenuItem :label="t('dock.terminal.splitDown')" :icon="SplitDown" :shortcut="shortcuts.label('splitTerminalDown')" @select="split(item, 'down')" />
          <UiMenuSeparator />
        </template>
        <UiMenuItem :label="t('dock.closeTab')" :icon="X" @select="close(item)" />
      </template>
    </UiContextMenu>
    <ShellDockMenu class="ms-0.5" />
  </div>
</template>
