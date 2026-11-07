<script setup lang="ts">
import { SquareTerminal, X } from '@/components/ui/icons'
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { terminalShell } from '@/ipc/terminal'
import { useTerminalsStore } from '@/stores/terminals'

// Comme VS Code et iTerm : un onglet porte la commande qui tourne (« pnpm », « node »), sinon le dossier du shell ;
// le nom du shell hors projet (le dossier d'une session sans projet ne dit rien) ; un numéro ne s'ajoute qu'entre
// deux onglets du même nom.
const POLL = 1500

const { t } = useI18n()
const terminals = useTerminalsStore()
const { chat, place } = useTerminalChat()

const list = computed(() => (chat.value ? terminals.tabsOf(chat.value.id) : []))
const activeKey = computed(() => (chat.value ? (terminals.active[chat.value.id] ?? null) : null))

const shell = ref<string | null>(null)
terminalShell().then((name) => (shell.value = name)).catch(() => {})
const folder = computed(() => {
  const path = place.value?.worktreePath ?? place.value?.cwd
  return (path ? path.split(/[\\/]/).filter(Boolean).at(-1) : null) ?? shell.value
})

const commands = reactive<Record<string, string | null>>({})
async function poll() {
  for (const tab of list.value) commands[tab.key] = await terminals.command(tab.key)
}
poll()
const timer = setInterval(poll, POLL)
onBeforeUnmount(() => clearInterval(timer))

const labels = computed(() => {
  const base = list.value.map((tab) => commands[tab.key] ?? folder.value ?? t('dock.terminal.tab', { n: tab.number }))
  return list.value.map((tab, index) => {
    const name = base[index]!
    return base.filter((other) => other === name).length > 1 ? `${name} ${tab.number}` : name
  })
})

function select(key: string) {
  if (!chat.value) return
  terminals.active[chat.value.id] = key
  nextTick(() => terminals.focus(key))
}
</script>

<template>
  <div class="flex min-w-0 shrink items-center gap-0.5" role="group" :aria-label="t('dock.terminal.list')">
    <div
      v-for="(tab, index) in list"
      :key="tab.key"
      class="group/row relative flex h-7 max-w-40 min-w-20 shrink items-center rounded-md text-xs"
      :class="tab.key === activeKey ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
    >
      <button
        type="button"
        class="flex h-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 focus-visible:outline-2 focus-visible:outline-ring"
        :aria-current="tab.key === activeKey ? 'true' : undefined"
        @click="select(tab.key)"
      >
        <SquareTerminal class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ labels[index] }}</span>
      </button>
      <UiIconButton
        inner
        class="absolute end-1 size-5! opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        :class="{ 'opacity-100': tab.key === activeKey }"
        :label="t('dock.terminal.close')"
        @click="chat && terminals.close(chat.id, tab.key)"
      >
        <X class="size-3" aria-hidden="true" />
      </UiIconButton>
    </div>
  </div>
</template>
