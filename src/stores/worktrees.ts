import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { Worktree } from '@/ipc/bindings/Worktree'
import { worktreeCreate, worktreeList, worktreeRemove } from '@/ipc/worktree'
import type { Project } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { worktreeBranch } from '@/utils/projects'

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

  // Ouvrir une session n'a besoin que d'une liste déjà lue : relire lancerait git à chaque changement d'onglet.
  function ensure(project: Project) {
    if (!lists[project.id]) return load(project)
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

  // Branche où travaille une session : celle de son worktree, sinon celle du dossier du projet. null hors git, ou
  // tant que la liste n'est pas lue (sauf son propre worktree, dont la branche se tire de son id).
  function branchOf(tab: Tab) {
    if (!tab.projectId) return null
    if (!tab.worktree) return lists[tab.projectId]?.find((tree) => tree.main)?.branch ?? null
    const tree = find(tab.projectId, tab.worktreePath)
    if (tree) return tree.branch
    return !tab.worktreePath || tab.worktreePath.endsWith(tab.id) ? worktreeBranch(tab.id) : null
  }

  return { lists, creating, load, ensure, create, remove, find, branchOf }
})
