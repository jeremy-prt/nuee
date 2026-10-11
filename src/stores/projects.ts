import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import type { ProjectIcons } from '@/ipc/bindings/ProjectIcons'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'
import { projectIcon, projectIconReset, projectIconSet } from '@/ipc/project'
import { worktreeSupport } from '@/ipc/worktree'
import { useAgentsStore } from '@/stores/agents'
import { agents, defaultAgent } from '@/utils/agents'
import { colorFromName, isProjectColor, mascotIds, mascotOf, type ProjectColor } from '@/utils/projects'

// Notifications coupées pour les chats du projet : pendant une heure, jusqu'au lendemain matin, ou sans limite.
export type MuteKind = 'hour' | 'tomorrow' | 'always'
export interface Mute {
  kind: MuteKind
  // null : sans limite.
  until: number | null
}
const MUTE_KINDS: MuteKind[] = ['hour', 'tomorrow', 'always']

// auto : l'icône trouvée dans le dossier, sinon la mascotte. image : celle importée dans les réglages.
export type IconMode = 'auto' | 'mascot' | 'image'
const ICON_MODES: IconMode[] = ['auto', 'mascot', 'image']

export interface Project {
  id: string
  name: string
  path: string
  icon: IconMode
  // null : la mascotte tirée de l'id du projet.
  mascot: string | null
  color: ProjectColor
  // Réglages de départ d'un nouveau chat du projet ; null suit Réglages › Agents.
  agent: AgentKind | null
  model: string | null
  effort: Effort | null
  // Chaque nouveau chat travaille dans un worktree git plutôt que dans le dossier.
  worktree: boolean
  muted: Mute | null
}

const STORAGE_KEY = 'nuee.projects.v1'

function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

// Les projets de la première version n'avaient que id, name et path : le reste prend sa valeur de départ.
function restore(value: Partial<Record<keyof Project, unknown>>): Project | null {
  if (typeof value.id !== 'string' || typeof value.path !== 'string') return null
  const name = typeof value.name === 'string' && value.name.trim() ? value.name : folderName(value.path)
  return {
    id: value.id,
    name,
    path: value.path,
    icon: ICON_MODES.includes(value.icon as IconMode) ? (value.icon as IconMode) : 'auto',
    mascot: typeof value.mascot === 'string' && mascotIds.includes(value.mascot) ? value.mascot : null,
    color: isProjectColor(value.color) ? value.color : colorFromName(name),
    agent: typeof value.agent === 'string' && value.agent in agents ? (value.agent as AgentKind) : null,
    model: typeof value.model === 'string' ? value.model : null,
    effort: typeof value.effort === 'string' ? (value.effort as Effort) : null,
    worktree: value.worktree === true,
    muted: restoreMute(value.muted),
  }
}

function restoreMute(value: unknown): Mute | null {
  const mute = value as Partial<Mute> | null
  if (!mute || !MUTE_KINDS.includes(mute.kind as MuteKind)) return null
  return { kind: mute.kind as MuteKind, until: typeof mute.until === 'number' ? mute.until : null }
}

function load(): Project[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.flatMap((value) => restore(value ?? {}) ?? []) : []
  } catch {
    return []
  }
}

export const useProjectsStore = defineStore('projects', () => {
  const agentSettings = useAgentsStore()
  const projects = ref<Project[]>(load())
  // Absente : pas encore lue.
  const icons = reactive<Record<string, ProjectIcons>>({})
  const requested = new Set<string>()
  const support = reactive<Record<string, WorktreeSupport>>({})
  // Une coupure arrivée à son terme disparaît de l'interface sans attendre un clic.
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), 30_000)

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
    const name = folderName(path)
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      path,
      icon: 'auto',
      mascot: null,
      color: colorFromName(name),
      agent: null,
      model: null,
      effort: null,
      worktree: false,
      muted: null,
    }
    projects.value.push(project)
    return project
  }

  function byId(id: string | null) {
    return projects.value.find((project) => project.id === id) ?? null
  }

  // Vide : le projet reprend le nom de son dossier.
  function rename(project: Project, name: string) {
    project.name = name.trim() || folderName(project.path)
  }

  function remove(id: string) {
    projects.value = projects.value.filter((project) => project.id !== id)
    delete icons[id]
    requested.delete(id)
    delete support[id]
    projectIconReset(id).catch(() => {})
  }

  // `refresh` : relue même si elle l'a déjà été (le dossier a pu changer depuis).
  async function loadIcon(project: Project, refresh = false) {
    if (!refresh && requested.has(project.id)) return
    requested.add(project.id)
    try {
      icons[project.id] = await projectIcon(project.id, project.path)
    } catch {
      icons[project.id] = { detected: null, custom: null }
    }
  }

  async function importIcon(project: Project, source: string) {
    const custom = await projectIconSet(project.id, source)
    icons[project.id] = { detected: icons[project.id]?.detected ?? null, custom }
    project.icon = 'image'
  }

  function mascotFor(project: Project) {
    return project.mascot ?? mascotOf(project.id)
  }

  // Ce qui s'affiche : une image, une mascotte, ou rien tant que le dossier n'a pas été lu. Une image importée
  // disparue retombe sur l'automatique.
  function shown(project: Project): { image: string } | { mascot: string } | null {
    const mascot = { mascot: mascotFor(project) }
    if (project.icon === 'mascot') return mascot
    const found = icons[project.id]
    if (!found) return null
    if (project.icon === 'image' && found.custom) return { image: found.custom }
    return found.detected ? { image: found.detected.data } : mascot
  }

  async function checkWorktree(project: Project) {
    try {
      support[project.id] = await worktreeSupport(project.path)
    } catch {
      delete support[project.id]
    }
  }

  // Fin de la coupure : dans une heure, ou demain à 8 h.
  function mute(project: Project, kind: MuteKind | null) {
    if (!kind) return (project.muted = null)
    const now = new Date()
    let until: number | null = null
    if (kind === 'hour') until = now.getTime() + 3_600_000
    if (kind === 'tomorrow') until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8).getTime()
    project.muted = { kind, until }
  }

  function isMuted(projectId: string | null, at = now.value) {
    const muted = byId(projectId)?.muted
    return !!muted && (muted.until === null || muted.until > at)
  }

  function chatAgent(projectId: string | null): AgentKind {
    return byId(projectId)?.agent ?? defaultAgent
  }

  // Réglages de départ d'un chat : ceux de l'agent dans Réglages › Agents, sauf ce que le projet a choisi.
  function chatOptions(projectId: string | null, agent: AgentKind): TurnOptions {
    const options = agentSettings.chatDefaults(agent)
    const project = byId(projectId)
    if (!project || chatAgent(projectId) !== agent) return options
    return { ...options, model: project.model ?? options.model, effort: project.effort ?? options.effort }
  }

  return {
    projects,
    now,
    icons,
    support,
    add,
    byId,
    rename,
    remove,
    loadIcon,
    importIcon,
    mascotFor,
    shown,
    checkWorktree,
    mute,
    isMuted,
    chatAgent,
    chatOptions,
  }
})
