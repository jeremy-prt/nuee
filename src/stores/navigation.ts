import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { WindowStyle } from '@/stores/appearance'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useSkillsStore } from '@/stores/skills'
import { agents } from '@/utils/agents'
import type { SettingsSection } from '@/utils/settings'

// Sous-page d'une section : réglages du thème, de l'image de fond, d'un style de fenêtre, d'un agent, d'un
// skill (`skill:` suivi du nom de son dossier), d'un serveur MCP (`mcp:` suivi de son nom), d'un service relié
// d'un projet (`project:` suivi de son id) ou des worktrees d'un projet (`worktrees:` suivi de son id), sous-page
// de celle du projet.
export type SettingsDetail =
  | WindowStyle
  | 'theme'
  | 'background'
  | AgentKind
  | `skill:${string}`
  | `mcp:${string}`
  | 'github'
  | `project:${string}`
  | `worktrees:${string}`

export function isAgentDetail(detail: SettingsDetail | null): detail is AgentKind {
  return !!detail && detail in agents
}

export function isSkillDetail(detail: SettingsDetail | null): detail is `skill:${string}` {
  return !!detail?.startsWith('skill:')
}

export function skillOfDetail(detail: `skill:${string}`) {
  return detail.slice('skill:'.length)
}

export function isServerDetail(detail: SettingsDetail | null): detail is `mcp:${string}` {
  return !!detail?.startsWith('mcp:')
}

export function serverOfDetail(detail: `mcp:${string}`) {
  return detail.slice('mcp:'.length)
}

export function isProjectDetail(detail: SettingsDetail | null): detail is `project:${string}` {
  return !!detail?.startsWith('project:')
}

export function projectOfDetail(detail: `project:${string}`) {
  return detail.slice('project:'.length)
}

export function isWorktreesDetail(detail: SettingsDetail | null): detail is `worktrees:${string}` {
  return !!detail?.startsWith('worktrees:')
}

export function projectOfWorktrees(detail: `worktrees:${string}`) {
  return detail.slice('worktrees:'.length)
}

// Page où mène Retour : la sous-page parente, sinon la section.
export function parentDetail(detail: SettingsDetail | null): SettingsDetail | null {
  return isWorktreesDetail(detail) ? `project:${projectOfWorktrees(detail)}` : null
}

// Un agent garde son nom de produit, un skill le nom qu'on tape, un serveur le sien : rien ne se traduit.
export function settingsDetailTitle(detail: SettingsDetail, t: (key: string) => string) {
  if (isAgentDetail(detail)) return agents[detail].name
  if (isSkillDetail(detail)) {
    const id = skillOfDetail(detail)
    return useSkillsStore().find(id)?.name ?? id
  }
  if (isServerDetail(detail)) return serverOfDetail(detail)
  if (isProjectDetail(detail)) return useProjectsStore().byId(projectOfDetail(detail))?.name ?? ''
  if (isWorktreesDetail(detail)) return t('settings.projects.worktrees.title')
  if (detail === 'github') return 'GitHub'
  if (detail === 'theme') return t('settings.themes.title')
  if (detail === 'background') return t('settings.background.title')
  return t(`settings.appearance.styles.${detail}`)
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
  const settingsDetail = ref<SettingsDetail | null>(null)
  // Projet affiché par Réglages › Projets : le dernier ouvert, que sa sous-page reprend en titre.
  const settingsProjectId = ref<string | null>(null)
  // Vue que le bouton Retour des réglages retrouve.
  const beforeSettings = ref<View>('home')
  // Réglage choisi dans la recherche : SettingsView le fait défiler jusqu'à lui et le met en avant.
  const revealed = ref<{ id: string; focus: boolean } | null>(null)

  const hasPanel = computed(() => PANEL_VIEWS.includes(view.value))

  // Fondu enchaîné à l'entrée, à la sortie et à l'intérieur des réglages : l'ancienne page s'efface pendant
  // que la nouvelle apparaît (API View Transitions), sans instant vide entre les deux.
  // La promesse se résout une fois la nouvelle page en place.
  async function crossfade(update: () => void) {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return update()
    await document.startViewTransition(update).updateCallbackDone
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

  // Liste de ShellProjectSwitcher ouverte : aussi par raccourci, d'où sa place ici.
  const switcherOpen = ref(false)
  // Sens du dernier changement de projet (1 : vers le suivant), repris par l'animation de la barre latérale.
  const projectStep = ref<1 | -1>(1)

  // Chat (sans projet) puis les projets, dans l'ordre de la barre latérale.
  function contexts() {
    return [null, ...useProjectsStore().ordered.map((project) => project.id)]
  }

  function openChats(id: string | null) {
    const order = contexts()
    const from = order.indexOf(projectId.value)
    const to = order.indexOf(id)
    if (from !== to) projectStep.value = to > from ? 1 : -1
    projectId.value = id
    go('chats')
  }

  // Boucle aux extrémités, en gardant le sens de l'animation.
  function stepProject(step: 1 | -1) {
    const order = contexts()
    const next = order[(order.indexOf(projectId.value) + step + order.length) % order.length] ?? null
    openChats(next)
    projectStep.value = step
  }

  // Ouvre les réglages directement sur une section (le bouton Mises à jour mène à Général), ou sur une sous-page.
  function openSettings(section: SettingsSection, detail: SettingsDetail | null = null) {
    const update = () => {
      settingsSection.value = section
      settingsDetail.value = detail
    }
    if (view.value === 'settings') return crossfade(update)
    update()
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
    if (detail && isProjectDetail(detail)) settingsProjectId.value = projectOfDetail(detail)
    return crossfade(() => {
      settingsDetail.value = detail
    })
  }

  function closeSettings() {
    go(beforeSettings.value)
  }

  // `focus` : choisi au clavier, le focus passe sur le réglage trouvé.
  function revealSetting(section: SettingsSection, detail: SettingsDetail | null, id: string, focus: boolean) {
    if (detail && isProjectDetail(detail)) settingsProjectId.value = projectOfDetail(detail)
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
    settingsProjectId,
    hasPanel,
    projectStep,
    switcherOpen,
    go,
    openChats,
    stepProject,
    openSettings,
    showSettingsSection,
    showSettingsDetail,
    closeSettings,
    revealed,
    revealSetting,
  }
})
