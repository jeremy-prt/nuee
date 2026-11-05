<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import { SquareTerminal } from '@/components/ui/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalsStore } from '@/stores/terminals'

const { t } = useI18n()
const terminals = useTerminalsStore()
const { chat, place } = useTerminalChat()
const host = useTemplateRef('host')

const list = computed(() => (chat.value ? terminals.tabsOf(chat.value.id) : []))
const activeKey = computed(() => (chat.value ? (terminals.active[chat.value.id] ?? null) : null))

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

watch([activeKey, host], ([key, element]) => {
  if (element) terminals.setHost(element)
  if (key) terminals.attach(key)
})

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

let observer: ResizeObserver | null = null
onMounted(() => {
  terminals.setHost(host.value)
  if (chat.value && !list.value.length) create()
  else if (activeKey.value) terminals.attach(activeKey.value)
  if (!host.value) return
  observer = new ResizeObserver(() => {
    if (activeKey.value) terminals.fit(activeKey.value)
  })
  observer.observe(host.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  terminals.releaseHost(host.value)
})
</script>

<template>
  <div v-if="!chat" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
    <SquareTerminal class="size-6 text-muted" aria-hidden="true" />
    <p class="text-sm text-muted">{{ t('dock.terminal.noSession') }}</p>
  </div>
  <!-- Toujours affiché : xterm mesure ses caractères dans la page, même pour le premier terminal. -->
  <div v-else class="relative min-h-0 flex-1">
    <div ref="host" class="terminal-host absolute inset-0 p-2 pe-1" />
    <div v-if="!list.length" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <SquareTerminal class="size-6 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">{{ t('dock.terminal.empty') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* xterm.css peint la zone de défilement en noir : le fond du volet doit rester visible (transparence). */
.terminal-host :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
