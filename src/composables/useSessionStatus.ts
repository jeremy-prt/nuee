import { useAttentionStore } from '@/stores/attention'
import { useConversationsStore } from '@/stores/conversations'

export type SessionStatus = 'approval' | 'question' | 'working' | 'done' | 'failed'

export const sessionStatusColor: Record<SessionStatus, string> = {
  approval: 'text-warning',
  question: 'text-warning',
  working: 'text-signal-text',
  done: 'text-success',
  failed: 'text-danger',
}

// État d'une session, du plus pressant au moins pressant : carte de la liste et onglet affichent le même.
export function useSessionStatus() {
  const conversations = useConversationsStore()
  const attention = useAttentionStore()

  return function sessionStatus(chatId: string): SessionStatus | null {
    const pending = conversations.find(chatId)?.approvals[0]
    if (pending) return pending.questions ? 'question' : 'approval'
    if (conversations.working(chatId)) return 'working'
    const signal = attention.unseenSignal(chatId)
    return signal === 'done' || signal === 'failed' ? signal : null
  }
}
