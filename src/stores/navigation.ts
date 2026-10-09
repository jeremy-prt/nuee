import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout'

export type View = 'home' | 'chats' | 'issues' | 'pullRequests' | 'notes' | 'search' | 'usage' | 'updates' | 'settings'

// Vues « liste à gauche, détail au centre » : elles affichent le second panneau.
const PANEL_VIEWS: readonly View[] = ['chats', 'issues', 'pullRequests', 'notes']

export const useNavigationStore = defineStore('navigation', () => {
  const layout = useLayoutStore()
  const view = ref<View>('home')
  // Contexte des chats : un projet, ou null pour les chats sans projet.
  const projectId = ref<string | null>(null)

  const hasPanel = computed(() => PANEL_VIEWS.includes(view.value))

  // Arriver sur une vue à liste rouvre toujours le panneau latéral, même s'il avait été fermé ailleurs.
  function go(target: View) {
    view.value = target
    if (PANEL_VIEWS.includes(target)) layout.panel.open = true
  }

  function openChats(id: string | null) {
    projectId.value = id
    go('chats')
  }

  return { view, projectId, hasPanel, go, openChats }
})
