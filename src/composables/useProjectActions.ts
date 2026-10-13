import { useI18n } from 'vue-i18n'
import { isAppError } from '@/ipc/agent'
import { ICON_EXTENSIONS, pickImage } from '@/ipc/dialog'
import { projectReveal } from '@/ipc/project'
import { useDialogStore } from '@/stores/dialog'
import { useGeneralStore } from '@/stores/general'
import { useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useTabTitle } from '@/composables/useTabTitle'

// Actions des menus de la barre latérale (clic droit et bouton « … ») sur un projet ou une session.
export function useProjectActions() {
  const { t } = useI18n()
  const projects = useProjectsStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const dialog = useDialogStore()
  const general = useGeneralStore()
  const toasts = useToastsStore()
  const { tabTitle } = useTabTitle()

  function fail(title: string, error: unknown) {
    console.error(title, error)
    toasts.push({ kind: 'error', title, body: isAppError(error) ? error.message : String(error) })
  }

  async function reveal(project: Project) {
    try {
      await projectReveal(project.path)
    } catch (error) {
      fail(t('settings.projects.revealFailed'), error)
    }
  }

  async function importIcon(project: Project) {
    const path = await pickImage(t('settings.projects.pickIcon'), ICON_EXTENSIONS)
    if (!path) return
    try {
      await projects.importIcon(project, path)
    } catch (error) {
      fail(t('settings.projects.iconFailed'), error)
    }
  }

  // Toutes les sessions d'un coup : on demande d'abord.
  async function archiveProjectChats(project: Project) {
    const n = workspace.tabsFor(project.id).filter((tab) => tab.started && !tab.archived).length
    const confirmed = await dialog.confirm({
      title: t('settings.projects.chats.archiveTitle', { name: project.name }),
      message: t('settings.projects.chats.archiveMessage', { n }, n),
      confirmLabel: t('settings.projects.chats.archiveConfirm'),
    })
    if (!confirmed) return
    try {
      const n = await workspace.archiveProjectChats(project.id)
      toasts.push({ kind: 'success', title: t('settings.projects.chats.archived', { n }, n), body: t('settings.projects.chats.archivedBody') })
    } catch (error) {
      fail(t('settings.projects.chats.archiveFailed'), error)
    }
  }

  async function deleteProject(project: Project) {
    const chats = workspace.tabsFor(project.id).filter((tab) => tab.started).length
    const confirmed = await dialog.confirm({
      title: t('settings.projects.deleteTitle', { name: project.name }),
      message: t('settings.projects.deleteMessage', { n: chats }, chats),
      confirmLabel: t('settings.projects.deleteConfirm'),
      danger: true,
    })
    if (!confirmed) return
    if (navigation.projectId === project.id) navigation.openChats(null)
    if (navigation.settingsProjectId === project.id) navigation.settingsProjectId = null
    projects.remove(project.id)
    await workspace.deleteProjectChats(project.id)
  }

  function openSettings(project: Project) {
    navigation.settingsProjectId = project.id
    navigation.openSettings('projects', `project:${project.id}`)
  }

  async function renameChat(tab: Tab, title: string) {
    try {
      await workspace.renameChat(tab.id, title)
    } catch (error) {
      fail(t('chats.renameFailed'), error)
    }
  }

  async function togglePin(tab: Tab) {
    try {
      await workspace.setPinned(tab.id, !tab.pinned)
    } catch (error) {
      fail(t('chats.pinFailed'), error)
    }
  }

  // La ligne quitte l'historique sans laisser de trace visible : le message dit où la retrouver.
  async function archiveChat(tab: Tab) {
    try {
      await workspace.archiveChat(tab.id)
      toasts.push({ kind: 'success', title: t('chats.archived'), body: t('chats.archivedBody') })
    } catch (error) {
      fail(t('chats.archiveFailed'), error)
    }
  }

  async function deleteChat(tab: Tab) {
    const confirmed =
      !general.confirmDelete ||
      (await dialog.confirm({
        title: t('chats.deleteTitle'),
        message: t('chats.deleteMessage', { title: tabTitle(tab) }),
        confirmLabel: t('chats.deleteConfirm'),
        danger: true,
      }))
    if (confirmed) await workspace.deleteChat(tab.id)
  }

  return { reveal, importIcon, archiveProjectChats, deleteProject, openSettings, renameChat, togglePin, archiveChat, deleteChat }
}
