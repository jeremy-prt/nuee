import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { Worktree } from '@/ipc/bindings/Worktree'
import { worktreeCreate, worktreeList, worktreeRemove } from '@/ipc/worktree'
import type { Project } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'

// Worktrees du dépôt de chaque projet, relus à chaque ouverture de la page du projet ou du menu du composer.
export const useWorktreesStore = defineStore('worktrees', () => {
  // Absente : pas encore lue.
  const lists = reactive<Record<string, Worktree[]>>({})
  // Dialogue de création ouvert, depuis l'en-tête de la page ou son état vide.
  const creating = ref(false)

  async function load(project: Project) {
    try {
      lists[project.id] = await worktreeList(project.path)
    } catch {
      lists[project.id] = []
    }
  }

  async function create(project: Project, branch: string, existing: boolean) {
    const created = await worktreeCreate(project.id, project.path, branch, existing)
    await load(project)
    return created
  }

  async function remove(project: Project, path: string) {
    const moved = await worktreeRemove(project.path, path)
    useWorkspaceStore().leaveWorktree(moved)
    await load(project)
  }

  function find(projectId: string | null, path: string | null) {
    return (projectId && path && lists[projectId]?.find((tree) => tree.path === path)) || null
  }

  return { lists, creating, load, create, remove, find }
})
