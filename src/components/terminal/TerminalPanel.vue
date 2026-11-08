<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import { Plus, SquareTerminal, X } from '@/components/ui/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useTerminalsStore } from '@/stores/terminals'

// Les shells de l'onglet choisi, côte à côte ou empilés (split, comme iTerm et T3 Code). ⌘D et ⌘⇧D partagent la zone
// quand le terminal a le focus : ils passent avant le ⌘D de la fenêtre (vue partagée des sessions).
const { t } = useI18n()
const terminals = useTerminalsStore()
const shortcuts = useShortcutsStore()
const { chat, place } = useTerminalChat()
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

// Une session sans terminal en reçoit un à l'ouverture du volet ; fermer le dernier laisse le volet vide.
watch(
  () => chat.value?.id,
  async (id) => {
    await nextTick()
    if (id && !terminals.tabsOf(id).length) create()
  },
)

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
  terminals.split(chat.value.id, place.value, direction)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  if (chat.value && !list.value.length) create()
  if (!area.value) return
  observer = new ResizeObserver(fitAll)
  observer.observe(area.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <UiEmpty v-if="!chat" :icon="SquareTerminal" :title="t('dock.terminal.emptyTitle')" :description="t('dock.terminal.noSession')" />
  <div
    v-else
    ref="area"
    class="relative flex min-h-0 flex-1"
    :class="group?.direction === 'down' ? 'flex-col' : 'flex-row'"
    @keydown.capture="onKeydown"
  >
    <div
      v-for="(shell, index) in group?.shells ?? []"
      :key="shell.key"
      class="group/pane relative min-h-0 min-w-0 flex-1"
      :class="index > 0 && (group?.direction === 'down' ? 'border-t border-stroke' : 'border-s border-stroke')"
      @focusin="terminals.active[chat.id] = shell.key"
    >
      <div :ref="(element) => bind(shell.key, element)" class="terminal-host absolute inset-0 p-2 pe-1" />
      <UiIconButton
        v-if="group && group.shells.length > 1"
        inner
        class="absolute end-1.5 top-1.5 size-6! opacity-0 group-hover/pane:opacity-100 focus-visible:opacity-100"
        :label="t('dock.terminal.closePane')"
        @click="terminals.close(chat.id, shell.key)"
      >
        <X class="size-3" aria-hidden="true" />
      </UiIconButton>
    </div>
    <UiEmpty v-if="!list.length" :icon="SquareTerminal" :title="t('dock.terminal.emptyTitle')" :description="t('dock.terminal.empty')" class="absolute inset-0">
      <UiButton size="sm" @click="create">
        <Plus class="size-3.5" aria-hidden="true" />
        {{ t('dock.terminal.new') }}
      </UiButton>
    </UiEmpty>
  </div>
</template>

<style scoped>
/* xterm.css peint la zone de défilement en noir : le fond du volet doit rester visible (transparence). */
.terminal-host :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
