import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { WindowStyle } from '@/stores/appearance'
import { useLayoutStore } from '@/stores/layout'
import type { SettingsSection } from '@/utils/settings'

export type SettingsDetail = WindowStyle | 'theme' | 'background'

export function settingsDetailKey(detail: SettingsDetail) {
  if (detail === 'theme') return 'settings.themes.title'
  if (detail === 'background') return 'settings.background.title'
  return `settings.appearance.styles.${detail}`
}

export type View = 'home' | 'chats' | 'issues' | 'pullRequests' | 'notes' | 'search' | 'usage' | 'settings'

// Vues « liste à gauche, détail au centre » : elles affichent le second panneau.
const PANEL_VIEWS: readonly View[] = ['chats', 'issues', 'pullRequests', 'notes']

export const useNavigationStore = defineStore('navigation', () => {
  const layout = useLayoutStore()
  const view = ref<View>('home')
  // Contexte des chats : un projet, ou null pour les chats sans projet.
  const projectId = ref<string | null>(null)
  const settingsSection = ref<SettingsSection>('general')
  // Sous-page d'Apparence : le thème, l'image de fond, ou un style de fenêtre.
  const settingsDetail = ref<SettingsDetail | null>(null)
  const detailKey = computed(() => (settingsDetail.value ? settingsDetailKey(settingsDetail.value) : ''))
  // Vue que le bouton Retour des réglages retrouve.
  const beforeSettings = ref<View>('home')
  // Réglage choisi dans la recherche : SettingsView le fait défiler jusqu'à lui et le met en avant.
  const revealed = ref<{ id: string; focus: boolean } | null>(null)

  const hasPanel = computed(() => PANEL_VIEWS.includes(view.value))

  // Fondu enchaîné à l'entrée, à la sortie et à l'intérieur des réglages : l'ancienne page s'efface pendant
  // que la nouvelle apparaît (API View Transitions), sans instant vide entre les deux.
  function crossfade(update: () => void) {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return update()
    document.startViewTransition(update)
  }

  // Arriver sur une vue à liste rouvre toujours le panneau latéral, même s'il avait été fermé ailleurs.
  function go(target: View) {
    const update = () => {
      if (target === 'settings' && view.value !== 'settings') beforeSettings.value = view.value
      view.value = target
      if (PANEL_VIEWS.includes(target)) layout.panel.open = true
    }
    if (target === 'settings' || view.value === 'settings') crossfade(update)
    else update()
  }

  function openChats(id: string | null) {
    projectId.value = id
    go('chats')
  }

  // Ouvre les réglages directement sur une section (le bouton Mises à jour mène à Général).
  function openSettings(section: SettingsSection) {
    if (view.value === 'settings') return showSettingsSection(section)
    settingsSection.value = section
    settingsDetail.value = null
    go('settings')
  }

  // Recliquer sur la section dans la barre latérale ramène aussi de sa sous-page.
  function showSettingsSection(section: SettingsSection) {
    crossfade(() => {
      settingsSection.value = section
      settingsDetail.value = null
    })
  }

  function showSettingsDetail(detail: SettingsDetail | null) {
    crossfade(() => {
      settingsDetail.value = detail
    })
  }

  function closeSettings() {
    go(beforeSettings.value)
  }

  // `focus` : choisi au clavier, le focus passe sur le réglage trouvé.
  function revealSetting(section: SettingsSection, detail: SettingsDetail | null, id: string, focus: boolean) {
    const update = () => {
      settingsSection.value = section
      settingsDetail.value = detail
      revealed.value = { id, focus }
    }
    if (settingsSection.value === section && settingsDetail.value === detail) update()
    else crossfade(update)
  }

  return {
    view,
    projectId,
    settingsSection,
    settingsDetail,
    settingsDetailKey: detailKey,
    hasPanel,
    go,
    openChats,
    openSettings,
    showSettingsSection,
    showSettingsDetail,
    closeSettings,
    revealed,
    revealSetting,
  }
})
