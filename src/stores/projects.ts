import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import type { ProjectIcons } from '@/ipc/bindings/ProjectIcons'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'
import { projectIcon, projectIconReset, projectIconSet } from '@/ipc/project'
import { worktreeSupport } from '@/ipc/worktree'
import { i18nGlobal } from '@/i18n'
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
  // Groupe de la barre latérale ; null : dans la liste hors groupe.
  group: string | null
  // En tête de son groupe, ou dans la section Épinglés de la barre latérale s'il n'en a pas.
  pinned: boolean
  // Teinte du fond de ses sessions ; null : le fond de l'app.
  background: ProjectColor | null
}

// Groupe de projets de la barre latérale, comme monocode.
export interface ProjectGroup {
  id: string
  name: string
  collapsed: boolean
  background: ProjectColor | null
}

const STORAGE_KEY = 'nuee.projects.v1'
const GROUPS_KEY = 'nuee.projectGroups.v1'

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
    group: typeof value.group === 'string' ? value.group : null,
    pinned: value.pinned === true,
    background: isProjectColor(value.background) ? value.background : null,
  }
}

function restoreGroup(value: Partial<Record<keyof ProjectGroup, unknown>>): ProjectGroup | null {
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
  return {
    id: value.id,
    name: value.name,
    collapsed: value.collapsed === true,
    background: isProjectColor(value.background) ? value.background : null,
  }
}

function loadGroups(): ProjectGroup[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.flatMap((value) => restoreGroup(value ?? {}) ?? []) : []
  } catch {
    return []
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
  const groups = ref<ProjectGroup[]>(loadGroups())
  // Un groupe disparu (stockage effacé à moitié) rend ses projets à la liste hors groupe.
  for (const project of projects.value) {
    if (project.group && !groups.value.some((group) => group.id === project.group)) project.group = null
  }
  const pinned = computed(() => projects.value.filter((project) => project.pinned && !project.group))
  const ungrouped = computed(() => projects.value.filter((project) => !project.pinned && !project.group))
  // Groupe qui vient d'être créé : son en-tête passe aussitôt en renommage.
  const editingGroupId = ref<string | null>(null)
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

  watch(
    groups,
    (value) => {
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(value))
      } catch {
        // Stockage indisponible : les groupes restent valables pour la session.
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
      group: null,
      pinned: false,
      background: null,
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
    const group = byId(id)?.group ?? null
    projects.value = projects.value.filter((project) => project.id !== id)
    dropIfEmpty(group)
    delete icons[id]
    requested.delete(id)
    delete support[id]
    projectIconReset(id).catch(() => {})
  }

  function projectsIn(groupId: string) {
    const members = projects.value.filter((project) => project.group === groupId)
    return [...members.filter((project) => project.pinned), ...members.filter((project) => !project.pinned)]
  }

  // Nom de départ libre : « Nouveau groupe », puis « Nouveau groupe 2 »… L'en-tête passe aussitôt en renommage.
  function createGroup() {
    const { t } = i18nGlobal()
    const name = (n: number) => (n > 1 ? t('groups.newNameN', { n }) : t('groups.newName'))
    const names = new Set(groups.value.map((group) => group.name))
    let n = 1
    while (names.has(name(n))) n++
    const group: ProjectGroup = { id: crypto.randomUUID(), name: name(n), collapsed: false, background: null }
    editingGroupId.value = group.id
    groups.value.push(group)
    return group
  }

  // Vide : le groupe garde son nom.
  function renameGroup(group: ProjectGroup, name: string) {
    if (name.trim()) group.name = name.trim()
  }

  // Les projets du groupe restent, hors groupe.
  function removeGroup(id: string) {
    for (const project of projects.value) if (project.group === id) project.group = null
    groups.value = groups.value.filter((group) => group.id !== id)
  }

  // Un projet rangé dans un groupe replié le déplie : il ne disparaît pas sous les yeux. Le groupe qu'il quitte
  // disparaît s'il est vide (choix de Jérémy) ; un groupe tout juste créé, lui, attend son premier projet.
  function moveToGroup(project: Project, groupId: string | null) {
    const left = project.group
    project.group = groupId
    const group = groups.value.find((item) => item.id === groupId)
    if (group) group.collapsed = false
    dropIfEmpty(left)
  }

  function dropIfEmpty(groupId: string | null) {
    if (groupId && !projects.value.some((project) => project.group === groupId)) removeGroup(groupId)
  }

  // Glisser-déposer : le projet prend le groupe et l'épingle de sa nouvelle place, juste avant `before` (sinon en fin
  // de liste). L'ordre de la barre latérale est celui du tableau, donc l'ordre d'ajout tant qu'on ne glisse rien.
  function moveProject(id: string, place: { group: string | null; pinned: boolean; before: string | null }) {
    const project = byId(id)
    if (!project) return
    const rest = projects.value.filter((item) => item.id !== id)
    const index = place.before ? rest.findIndex((item) => item.id === place.before) : -1
    rest.splice(index === -1 ? rest.length : index, 0, project)
    if (rest.some((item, i) => item !== projects.value[i])) projects.value = rest
    if (project.pinned !== place.pinned) project.pinned = place.pinned
    if (project.group !== place.group) moveToGroup(project, place.group)
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
    groups,
    pinned,
    ungrouped,
    editingGroupId,
    projectsIn,
    createGroup,
    renameGroup,
    removeGroup,
    moveToGroup,
    moveProject,
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
