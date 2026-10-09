import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface Project {
  id: string
  name: string
  path: string
}

const STORAGE_KEY = 'nuee.projects.v1'

function load(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Project[]
  } catch {
    return []
  }
}

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>(load())

  watch(
    projects,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Stockage indisponible : la liste reste valable pour la session.
      }
    },
    { deep: true },
  )

  function add(path: string) {
    const existing = projects.value.find((project) => project.path === path)
    if (existing) return existing
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
    const project: Project = { id: crypto.randomUUID(), name, path }
    projects.value.push(project)
    return project
  }

  function byId(id: string | null) {
    return projects.value.find((project) => project.id === id) ?? null
  }

  return { projects, add, byId }
})
