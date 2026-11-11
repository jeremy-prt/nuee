<script setup lang="ts">
import { Columns2, LoaderCircle, PanelRight, Plus, SplitDown, X } from '@/components/ui/icons'
import { type Component, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { dockIcons } from '@/components/shell/dockIcons'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { useDockClose } from '@/composables/useDockClose'
import { useDockOpener } from '@/composables/useDockOpener'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import { useBrowserStore } from '@/stores/browser'
import { useDragStore } from '@/stores/drag'
import { useShortcutsStore } from '@/stores/shortcuts'
import { DOCK_VIEWS, type DockView, SIDE_BY_SIDE, useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'

// Onglets du panneau de droite : une icône fixe par volet, ouvert ou non (plus de « + »), puis une par page pour le
// navigateur et une par groupe de shells pour le terminal (pas de seconde barre dans le volet). Recliquer l'onglet
// affiché ramène le lanceur ; sa croix est au bout de la ligne d'outils du volet.
// Au clavier, Suppr ferme l'onglet qui a le focus ; clic droit pour fermer, diviser un terminal ou ouvrir
// le volet à côté de celui affiché (panneau partagé, `layout.right.aside`). Tiré sur le panneau, il s'y place dans
// une zone (`startDockDrag`).
interface Item {
  key: string
  view: DockView
  label: string
  icon: Component
  loading: boolean
  page: BrowserTab | null
  // Groupe de shells d'un onglet du terminal.
  group: string | null
  // Volet pas encore ouvert : un clic l'ouvre.
  closed: boolean
}

const { t } = useI18n()
const layout = useLayoutStore()
// Le second volet se pose à côté dans un panneau large, en dessous sinon : libellé et icône le disent.
const beside = computed(() => layout.right.size >= SIDE_BY_SIDE)
const browser = useBrowserStore()
const terminals = useTerminalsStore()
const shortcuts = useShortcutsStore()
const { chat, place } = useTerminalChat()
const shellLabels = useTerminalLabels()
const { close } = useDockClose()
const open = useDockOpener()
const drag = useDragStore()
const { startDockDrag } = useLayoutDrag()

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
  DOCK_VIEWS.flatMap((view): Item[] => {
    if (!layout.right.tabs.includes(view)) {
      return [{ key: view, view, label: t(`dock.${view}.title`), icon: dockIcons[view], loading: false, page: null, group: null, closed: true }]
    }
    const pages = view === 'browser' && chat.value ? browser.tabsOf(chat.value.id) : []
    if (pages.length) {
      return pages.map((page) => ({ key: page.id, view, label: pageLabel(page), icon: dockIcons.browser, loading: page.loading, page, group: null, closed: false }))
    }
    const groups = view === 'terminal' && chat.value ? terminals.groupsOf(chat.value.id) : []
    if (groups.length) {
      return groups.map(({ group, shells, direction }) => {
        const shown = shells.find((shell) => shell.key === terminals.active[chat.value!.id]) ?? shells[0]!
        const icon = shells.length < 2 ? dockIcons.terminal : direction === 'down' ? SplitDown : Columns2
        return { key: group, view, label: shellLabels.value[shown.key] ?? t('dock.terminal.title'), icon, loading: false, page: null, group, closed: false }
      })
    }
    return [{ key: view, view, label: t(`dock.${view}.title`), icon: dockIcons[view], loading: false, page: null, group: null, closed: false }]
  }),
)

function shown(view: DockView) {
  return layout.right.active === view || (!!layout.right.active && layout.right.aside === view)
}

// Affiché dans une zone du panneau : il montre son titre, comme l'onglet actif de chaque groupe de VS Code.
function isActive(item: Item) {
  if (item.closed || !shown(item.view) || !chat.value) return false
  if (item.page) return browser.active[chat.value.id] === item.page.id
  if (item.group) return groupOfActive() === item.group
  return true
}

// Panneau partagé : l'onglet de la zone qui a le focus (où s'affichera le prochain volet choisi) garde le fond plein,
// celui de l'autre zone un fond plus léger et un texte atténué, comme les groupes d'éditeurs de VS Code.
function tone(item: Item) {
  if (!isActive(item)) return 'text-muted/60 hover:bg-selection-hover hover:text-content'
  if (layout.right.aside && layout.zoneOf(item.view) !== layout.zone) return 'bg-selection-hover text-muted hover:text-content'
  return 'bg-selection text-content'
}

function zoneLabel(item: Item) {
  const zone = layout.right.aside ? layout.zoneOf(item.view) : null
  if (!zone) return ''
  const beside = layout.right.size >= SIDE_BY_SIDE
  return t(`dock.zone.${beside ? (zone === 'start' ? 'left' : 'right') : zone === 'start' ? 'top' : 'bottom'}`)
}

function groupOfActive() {
  if (!chat.value) return null
  return terminals.tabsOf(chat.value.id).find((shell) => shell.key === terminals.active[chat.value!.id])?.group ?? null
}

function shellsOf(group: string) {
  return chat.value ? terminals.tabsOf(chat.value.id).filter((shell) => shell.group === group) : []
}

// Page ou groupe de shells montré par le volet, sans toucher aux zones.
function pick(item: Item) {
  if (item.page && chat.value) browser.select(chat.value.id, item.page.id)
  const shell = item.group && groupOfActive() !== item.group ? shellsOf(item.group)[0] : null
  if (shell && chat.value) terminals.active[chat.value.id] = shell.key
}

function select(item: Item) {
  if (item.closed) return open(item.view)
  if (isActive(item) && (!layout.right.aside || layout.zoneOf(item.view) === layout.zone)) {
    if (layout.right.aside) layout.closeZone(layout.zoneOf(item.view)!)
    else layout.showLauncher()
    return
  }
  pick(item)
  layout.showView(item.view)
  if (item.group && chat.value) {
    const key = terminals.active[chat.value.id]
    if (key) nextTick(() => terminals.focus(key))
  }
}

function dragging(item: Item) {
  return drag.source?.kind === 'dock' && drag.source.id === item.key
}

function split(item: Item, direction: 'right' | 'down') {
  if (!chat.value || !place.value) return
  select(item)
  terminals.split(chat.value.id, place.value, direction)
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-0.5" role="tablist" :aria-label="t('dock.right')">
    <UiContextMenu
      v-for="item in items"
      :key="item.key"
      class="group/tab relative flex h-7 max-w-36 min-w-0 shrink items-center rounded-md text-xs"
      :class="[tone(item), { 'opacity-50': dragging(item) }]"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="isActive(item)"
        :data-dock-tab="item.view"
        :title="item.page?.url ?? item.label"
        class="flex h-full min-w-0 items-center rounded-md px-[7px] focus-visible:outline-2 focus-visible:outline-ring"
        @click="select(item)"
        @pointerdown="item.closed || startDockDrag($event, item.key, item.view, item.label, () => pick(item))"
        @auxclick.middle="item.closed || close(item)"
        @keydown.delete="item.closed || close(item)"
        @keydown.backspace="item.closed || close(item)"
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
        <!-- Comme monocode : l'onglet affiché (un par zone) montre son titre, les autres leur icône ; le titre s'ouvre et
             se referme en largeur (`.dock-tab-label`). -->
        <span class="dock-tab-label min-w-0" :data-open="isActive(item) || undefined">
          <span class="min-w-0 truncate ps-1.5 pe-px">{{ item.label }}</span>
        </span>
        <span v-if="zoneLabel(item)" class="sr-only">{{ zoneLabel(item) }}</span>
      </button>
      <template #menu>
        <template v-if="item.view === 'browser' && !item.closed">
          <UiMenuItem :label="t('dock.browser.newTab')" :icon="Plus" @select="open('browser')" />
          <UiMenuSeparator />
        </template>
        <template v-if="item.view === 'terminal' && !item.closed">
          <UiMenuItem :label="t('dock.terminal.new')" :icon="Plus" @select="open('terminal')" />
          <UiMenuItem :label="t('dock.terminal.splitRight')" :icon="Columns2" :shortcut="shortcuts.label('splitTerminal')" @select="split(item, 'right')" />
          <UiMenuItem :label="t('dock.terminal.splitDown')" :icon="SplitDown" :shortcut="shortcuts.label('splitTerminalDown')" @select="split(item, 'down')" />
          <UiMenuSeparator />
        </template>
        <template v-if="layout.right.aside && layout.zoneOf(item.view)">
          <UiMenuItem :label="t('dock.closeAside')" :icon="PanelRight" @select="layout.closeZone(layout.zoneOf(item.view)!)" />
          <UiMenuSeparator />
        </template>
        <template v-else-if="layout.right.active && item.view !== layout.right.active">
          <UiMenuItem :label="t(beside ? 'dock.openAside' : 'dock.openBelow')" :icon="beside ? Columns2 : SplitDown" @select="layout.showAside(item.view)" />
          <UiMenuSeparator />
        </template>
        <UiMenuItem v-if="!item.closed" :label="t('dock.closeTab')" :icon="X" @select="close(item)" />
      </template>
    </UiContextMenu>
  </div>
</template>
