import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

// Crée un chat dans le contexte demandé (projet ou sans projet) et affiche l'historique de ce contexte.
// `command` : posée dans le champ du nouveau chat (Nouveau skill...), elle part avec le premier message.
export function useNewChat() {
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()

  return function newChat(projectId = navigation.view === 'chats' ? navigation.projectId : null, command: ChatCommand | null = null) {
    navigation.openChats(projectId)
    const tab = workspace.openChat()
    if (command) conversations.setCommand(tab.id, command)
  }
}
