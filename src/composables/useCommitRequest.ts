import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useConversationsStore } from '@/stores/conversations'

// Demande à l'agent de la session active de committer, depuis le volet Session comme depuis Modifications.
export function useCommitRequest() {
  const { t } = useI18n()
  const { chat, place } = useTerminalChat()
  const conversations = useConversationsStore()

  const phase = computed(() => (chat.value ? conversations.find(chat.value.id)?.phase : undefined))

  function commit() {
    if (!chat.value || !place.value || phase.value !== 'idle') return
    conversations.send(chat.value.id, place.value, t('dock.session.commitPrompt'), [])
  }

  return { phase, commit }
}
