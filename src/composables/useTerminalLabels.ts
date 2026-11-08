import { computed, onBeforeUnmount, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useTerminalsStore } from '@/stores/terminals'

// Comme VS Code et T3 Code : la commande qui tourne (« pnpm », « node »), sinon « Terminal », numéroté dès qu'il y en
// a plusieurs. Le nom du shell ou le dossier, les mêmes pour tous, n'apprennent rien.
const POLL = 1500

export function useTerminalLabels() {
  const { t } = useI18n()
  const terminals = useTerminalsStore()
  const { chat } = useTerminalChat()

  const list = computed(() => (chat.value ? terminals.tabsOf(chat.value.id) : []))

  const commands = reactive<Record<string, string | null>>({})
  async function poll() {
    for (const tab of list.value) commands[tab.key] = await terminals.command(tab.key)
  }
  poll()
  const timer = setInterval(poll, POLL)
  onBeforeUnmount(() => clearInterval(timer))

  return computed(() =>
    Object.fromEntries(
      list.value.map((tab) => [
        tab.key,
        commands[tab.key] ?? (list.value.length > 1 ? t('dock.terminal.tab', { n: tab.number }) : t('dock.terminal.title')),
      ]),
    ) as Record<string, string>,
  )
}
