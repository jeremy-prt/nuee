import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { GithubRepo } from '@/ipc/bindings/GithubRepo'
import type { Project } from '@/stores/projects'

const PARENT_KEY = 'nuee.clone.parent'

function loadParent() {
  try {
    return localStorage.getItem(PARENT_KEY)
  } catch {
    return null
  }
}

// Fenêtre « Ajouter un projet » (ProjectAddDialog, montée une fois dans App.vue) : request() rend le projet ajouté,
// ou null si elle est fermée sans rien ajouter.
export const useAddProjectStore = defineStore('addProject', () => {
  const open = ref(false)
  // Dépôts déjà lus, par compte (`hôte/login`) : gh met plusieurs secondes à les lister.
  const repos = shallowRef<Record<string, GithubRepo[]>>({})
  // Dossier où le dernier clone a été fait.
  const parent = ref(loadParent())
  let resolve: ((project: Project | null) => void) | null = null

  function finish(project: Project | null) {
    open.value = false
    resolve?.(project)
    resolve = null
  }

  function request() {
    finish(null)
    open.value = true
    return new Promise<Project | null>((done) => {
      resolve = done
    })
  }

  function setRepos(account: string, list: GithubRepo[]) {
    repos.value = { ...repos.value, [account]: list }
  }

  function rememberParent(path: string) {
    parent.value = path
    try {
      localStorage.setItem(PARENT_KEY, path)
    } catch {
      // Stockage indisponible : le dossier reste retenu pour la session.
    }
  }

  return { open, repos, parent, request, finish, setRepos, rememberParent }
})
