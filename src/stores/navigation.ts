import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { WindowStyle } from '@/stores/appearance'
import { useLayoutStore } from '@/stores/layout'
import type { SettingsSection } from '@/utils/settings'

type SettingsDetail = WindowStyle | 'theme'

export type View = 'home' | 'chats' | 'issues' | 'pullRequests' | 'notes' | 'search' | 'usage' | 'updates' | 'settings'

// Vues « liste à gauche, détail au centre » : elles affichent le second panneau.
const PANEL_VIEWS: readonly View[] = ['chats', 'issues', 'pullRequests', 'notes']

export const useNavigationStore = defineStore('navigation', () => {
  const layout = useLayoutStore()
  const view = ref<View>('home')
  // Contexte des chats : un projet, ou null pour les chats sans projet.
  const projectId = ref<string | null>(null)
  const settingsSection = ref<SettingsSection>('general')
  // Sous-page d'Apparence : les réglages du thème, ou ceux d'un style de fenêtre.
  const settingsDetail = ref<SettingsDetail | null>(null)
  const settingsDetailKey = computed(() =>
    settingsDetail.value === 'theme' ? 'settings.themes.title' : `settings.appearance.styles.${settingsDetail.value}`,
  )
  // Vue que le bouton Retour des réglages retrouve.
  const beforeSettings = ref<View>('home')

  const hasPanel = computed(() => PANEL_VIEWS.includes(view.value))

  // Arriver sur une vue à liste rouvre toujours le panneau latéral, même s'il avait été fermé ailleurs.
  function go(target: View) {
    if (target === 'settings' && view.value !== 'settings') beforeSettings.value = view.value
    view.value = target
    if (PANEL_VIEWS.includes(target)) layout.panel.open = true
  }

  function openChats(id: string | null) {
    projectId.value = id
    go('chats')
  }

  // Recliquer sur la section dans la barre latérale ramène aussi de sa sous-page.
  function showSettingsSection(section: SettingsSection) {
    settingsSection.value = section
    settingsDetail.value = null
  }

  function closeSettings() {
    go(beforeSettings.value)
  }

  return {
    view,
    projectId,
    settingsSection,
    settingsDetail,
    settingsDetailKey,
    hasPanel,
    go,
    openChats,
    showSettingsSection,
    closeSettings,
  }
})
