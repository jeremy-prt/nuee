import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

// Crée un chat dans le contexte demandé (projet ou sans projet) et affiche l'historique de ce contexte.
export function useNewChat() {
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const layout = useLayoutStore()

  return function newChat(projectId = navigation.view === 'chats' ? navigation.projectId : null) {
    navigation.openChats(projectId)
    workspace.newTab()
    // Une session vierge démarre sans panneau de droite : il s'ouvre au premier message (ChatPane).
    layout.right.open = false
  }
}
