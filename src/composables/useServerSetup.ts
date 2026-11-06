import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useDraftsStore } from '@/stores/drafts'
import { useServersStore } from '@/stores/servers'

// Pas d'éditeur de launch.json : comme l'app Claude, l'agent repère les serveurs et écrit le fichier. La demande
// arrive dans le champ de la session, à relire avant l'envoi.
export function useServerSetup() {
  const { t } = useI18n()
  const { chat } = useTerminalChat()
  const servers = useServersStore()
  const drafts = useDraftsStore()

  const list = computed(() => (chat.value ? servers.listOf(chat.value.id) : null))

  function ask() {
    if (!chat.value) return
    const problem = list.value?.problem
    drafts.propose(chat.value.id, problem ? t('dock.servers.fixPrompt', { error: problem }) : t('dock.servers.addPrompt'))
  }

  return { list, ask }
}
