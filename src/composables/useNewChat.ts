import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

// Crée un chat dans le contexte demandé (projet ou sans projet) et affiche l'historique de ce contexte.
export function useNewChat() {
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()

  return function newChat(projectId = navigation.view === 'chats' ? navigation.projectId : null) {
    navigation.openChats(projectId)
    workspace.openChat()
  }
}
