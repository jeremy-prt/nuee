import { useAddProjectStore } from '@/stores/addProject'

// Ouvre « Ajouter un projet » (dossier de l'ordinateur ou clone GitHub) : rend le projet ajouté, ou déjà connu.
export function useAddProject() {
  const store = useAddProjectStore()
  return () => store.request()
}
