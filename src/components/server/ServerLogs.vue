<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import { Play, Stop, X } from '@/components/ui/icons'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ServerStatusDot from '@/components/server/ServerStatusDot.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useAppearanceStore } from '@/stores/appearance'
import { useServersStore } from '@/stores/servers'
import { theme } from '@/stores/terminals'

// Logs d'un serveur, en lecture seule : xterm garde les couleurs et les lignes réécrites des outils de dev.
const props = defineProps<{ root: string; name: string }>()

const { t } = useI18n()
const servers = useServersStore()
const { chat, place } = useTerminalChat()
const host = useTemplateRef('host')

const server = computed(() => servers.lists[props.root]?.servers.find((item) => item.name === props.name) ?? null)
const alive = computed(() => server.value?.status === 'starting' || server.value?.status === 'running')
const state = computed(() => {
  const current = server.value
  if (!current) return ''
  if (current.status === 'exited' && current.exitCode !== null) return t('dock.servers.exitCode', { code: current.exitCode })
  const status = t(`dock.servers.status.${current.status}`)
  return alive.value ? `${status} · :${current.activePort ?? current.port}` : status
})

const term = new Terminal({
  allowTransparency: true,
  convertEol: true,
  disableStdin: true,
  cursorBlink: false,
  cursorInactiveStyle: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.2,
  scrollback: 5000,
  theme: theme(),
})
const fit = new FitAddon()
term.loadAddon(fit)

watch(
  () => {
    const appearance = useAppearanceStore()
    return [appearance.theme, appearance.accent, appearance.resolvedMode]
  },
  () => requestAnimationFrame(() => (term.options.theme = theme())),
)

let unlisten: (() => void) | null = null
function follow() {
  unlisten?.()
  term.reset()
  term.write(servers.textOf(props.root, props.name))
  unlisten = servers.listen(props.root, props.name, (data, reset) => {
    if (reset) term.reset()
    term.write(data)
  })
}
watch(() => [props.root, props.name], follow)

function toggle() {
  if (alive.value) servers.stop(props.root, props.name)
  else if (chat.value && place.value) servers.start(chat.value.id, place.value, props.name)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!host.value) return
  term.open(host.value)
  fit.fit()
  follow()
  observer = new ResizeObserver(() => fit.fit())
  observer.observe(host.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  unlisten?.()
  term.dispose()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-stroke ps-4 pe-3.5 text-xs">
      <ServerStatusDot v-if="server" :status="server.status" class="size-3" />
      <span class="truncate text-content">{{ t('dock.servers.logsOf', { name }) }}</span>
      <span class="truncate text-muted">{{ state }}</span>
      <span class="flex-1" />
      <UiIconButton v-if="server && !server.external" :label="alive ? t('dock.servers.stop') : t('dock.servers.start')" @click="toggle">
        <Stop v-if="alive" class="size-3.5" aria-hidden="true" />
        <Play v-else class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="t('dock.servers.closeLogs')" @click="servers.hide()">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
    <div class="relative min-h-0 flex-1">
      <div ref="host" class="logs-host absolute inset-0 p-2 pe-1" role="log" :aria-label="t('dock.servers.logsOf', { name })" />
    </div>
  </div>
</template>

<style scoped>
.logs-host :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
