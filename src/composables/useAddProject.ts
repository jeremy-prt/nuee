import { useI18n } from 'vue-i18n'
import { pickFolder } from '@/ipc/dialog'
import { useProjectsStore } from '@/stores/projects'

// Sélecteur de dossier natif (il permet aussi d'en créer un) : rend le projet ajouté, ou déjà connu.
export function useAddProject() {
  const { t } = useI18n()
  const projects = useProjectsStore()

  return async function addProject() {
    const path = await pickFolder(t('rail.pickProject'))
    return path ? projects.add(path) : null
  }
}
