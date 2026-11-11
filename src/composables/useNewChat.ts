import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

// Crée un chat dans le contexte demandé (projet ou sans projet) et affiche l'historique de ce contexte.
// `tab` (« + » de la bande, ⌘T) : un onglet de plus depuis les sessions. Ailleurs, et pour « Nouvelle session », la
// vierge du contexte est reprise : celle de « Nouvel espace de travail » n'est pas un onglet aux yeux de l'utilisateur.
export function useNewChat(kind: 'session' | 'tab' = 'session') {
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()

  // Sans projet précisé : celui qui est affiché, quelle que soit la page d'où part le raccourci.
  return function newChat(projectId = navigation.projectId) {
    const another = kind === 'tab' && navigation.view === 'chats'
    navigation.openChats(projectId)
    if (another) workspace.newTab()
    else workspace.showBlank()
  }
}
