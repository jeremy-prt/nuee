import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { isAppError } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { McpServer } from '@/ipc/bindings/McpServer'
import type { Skill } from '@/ipc/bindings/Skill'
import type { SkillMode } from '@/ipc/bindings/SkillMode'
import { mcpCancelLogin, mcpCheck, mcpLogin, mcpSetEnabled, mcpStatus } from '@/ipc/mcp'
import { skillsList, skillsRead, skillsReveal, skillsSetMode, skillsTrash, skillsWrite } from '@/ipc/skills'
import { useDialogStore } from '@/stores/dialog'
import { useToastsStore } from '@/stores/toasts'
import { agents } from '@/utils/agents'

export type { McpServer, Skill }

const STORAGE_KEY = 'nuee.skills.v2'
// Seul Claude Code est branché : la page montre sa config.
const AGENT: AgentKind = 'claude'
const AGENT_NAME = agents[AGENT].name
const MODES: SkillMode[] = ['on', 'nameOnly', 'userInvocableOnly', 'off']
// nuee : un réglage ne vaut que pour les chats de Nuée. everywhere : il modifie la config de l'agent.
export type Scope = 'nuee' | 'everywhere'
export type Group = 'skills' | 'servers'

function defaultPrefs() {
  return { skills: {} as Record<string, SkillMode>, servers: [] as string[] }
}

function loadPrefs() {
  const prefs = defaultPrefs()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
    for (const [id, mode] of Object.entries(saved.skills ?? {})) {
      if (MODES.includes(mode as SkillMode)) prefs.skills[id] = mode as SkillMode
    }
    prefs.servers = list(saved.servers)
  } catch {
    // Choix illisibles : on repart des valeurs par défaut.
  }
  return prefs
}

function message(error: unknown) {
  return isAppError(error) ? error.message : String(error)
}

// Deux portées. Nuée seulement : gardé ici, envoyé à chaque lancement d'un chat (SessionSpec). Partout : écrit
// dans la config de l'agent, le choix propre à Nuée s'efface pour suivre. La liste ne règle que Nuée.
export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const servers = ref<McpServer[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  // État des serveurs en cours de lecture : la CLI met quelques secondes à les joindre.
  const checking = ref(false)
  const errors = reactive<{ skills: string | null; servers: string | null }>({ skills: null, servers: null })
  const prefs = reactive(loadPrefs())
  // Groupes repliés : le temps de la session seulement, jamais mémorisés (choix de Jérémy).
  const collapsed = reactive(new Set<Group>())
  const scope = ref<Scope>('nuee')
  // Serveurs en connexion ou en nouvel essai ; `logins` : ceux qui attendent le navigateur.
  const pending = reactive(new Set<string>())
  const logins = reactive(new Set<string>())
  const trashing = ref<string | null>(null)
  // Panneau de droite des réglages : le skill montré, et son éditeur. Le brouillon vit ici : quitter les
  // réglages démonte le panneau, il doit retrouver ses modifications au retour.
  const previewed = ref<Skill | null>(null)
  const editing = ref(false)
  const draft = ref('')
  const dirty = ref(false)

  watch(
    prefs,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      } catch {
        // Stockage indisponible : le choix reste valable pour la session.
      }
    },
    { deep: true },
  )

  // Relue à chaque ouverture du menu « / » ou de la page (quelques fichiers, comme monocode) plutôt que
  // surveillée. Seule la dernière lecture lancée écrit la liste : une lecture partie avant une écriture
  // ne l'écrase pas.
  let reading = 0
  async function loadSkills() {
    const current = ++reading
    loading.value = true
    try {
      const list = await skillsList(AGENT)
      if (current !== reading) return
      skills.value = list
      errors.skills = null
      const shown = previewed.value
      if (shown) previewed.value = skills.value.find((skill) => skill.id === shown.id) ?? shown
    } catch (error) {
      if (current === reading) errors.skills = message(error)
    } finally {
      if (current === reading) {
        loading.value = false
        loaded.value = true
      }
    }
  }

  // Une relecture lancée pendant une autre la remplace : seule la dernière écrit la liste.
  let run = 0
  async function loadServers() {
    const current = ++run
    checking.value = true
    const apply = (list: McpServer[]) => {
      if (current === run) servers.value = list
    }
    try {
      apply(await mcpStatus(AGENT, apply))
      if (current === run) errors.servers = null
    } catch (error) {
      if (current === run) errors.servers = message(error)
    } finally {
      if (current === run) checking.value = false
    }
  }

  function load() {
    return Promise.all([loadSkills(), loadServers()])
  }

  // Relecture demandée par un clic : le message dit ce qui a été trouvé.
  async function refresh() {
    await load()
    const { t } = i18nGlobal()
    const failed = errors.skills ?? errors.servers
    if (failed) return useToastsStore().push({ kind: 'error', title: t('feedback.refreshFailed'), body: failed })
    const found = skills.value.length + servers.value.length
    const body = found
      ? `${t('feedback.skills', skills.value.length)} · ${t('feedback.servers', servers.value.length)}`
      : t('feedback.nothingFound')
    useToastsStore().push({ kind: 'success', title: t('feedback.listRefreshed'), body })
  }

  // Réglage d'un skill à une portée : pour Nuée, le sien s'il en a un, sinon celui de l'agent.
  function mode(skill: Skill, at: Scope = 'nuee') {
    return (at === 'nuee' && prefs.skills[skill.id]) || skill.mode
  }

  // Skills appelables dans un message : leur `/nom` s'affiche en pastille, dans le champ comme dans la conversation.
  const names = computed(() => new Set(skills.value.filter((skill) => mode(skill) !== 'off').map((skill) => skill.name)))

  // Nuée a son propre réglage pour ce skill, différent de celui de l'agent.
  function differs(skill: Skill) {
    const own = prefs.skills[skill.id]
    return own !== undefined && own !== skill.mode
  }

  async function setMode(skill: Skill, value: SkillMode, at: Scope = 'nuee') {
    if (at === 'nuee') {
      if (value === skill.mode) delete prefs.skills[skill.id]
      else prefs.skills[skill.id] = value
      return
    }
    delete prefs.skills[skill.id]
    const previous = skill.mode
    skill.mode = value
    try {
      await skillsSetMode(AGENT, skill.id, value)
    } catch (error) {
      skill.mode = previous
      fail('settings.skills.modeFailed', skill.name, error)
    }
  }

  // Un serveur coupé partout ne peut pas être rallumé pour Nuée seule : la CLI cumule les refus.
  function serverOn(server: McpServer, at: Scope = 'nuee') {
    if (server.status === 'disabled') return false
    return at === 'everywhere' || !prefs.servers.includes(server.name)
  }

  function serverLocked(server: McpServer, at: Scope = 'nuee') {
    return at === 'nuee' && server.status === 'disabled'
  }

  async function setServer(server: McpServer, on: boolean, at: Scope = 'nuee') {
    const without = () => prefs.servers.filter((name) => name !== server.name)
    if (at === 'nuee') {
      prefs.servers = on ? without() : [...without(), server.name]
      return
    }
    prefs.servers = without()
    const previous = server.status
    server.status = on ? 'pending' : 'disabled'
    try {
      await mcpSetEnabled(AGENT, server.name, on)
    } catch (error) {
      server.status = previous
      fail('settings.skills.serverFailed', server.name, error)
      return
    }
    if (on) await reconnect(server.name)
  }

  function findServer(name: string) {
    return servers.value.find((server) => server.name === name) ?? null
  }

  // Ce que les chats de Nuée changent à la config de l'agent (SessionSpec).
  function exclusions() {
    return { skills: { ...prefs.skills }, serversOff: [...prefs.servers] }
  }

  // Choix propres à Nuée seulement : la config de l'agent (portée Partout) reste telle quelle.
  function reset() {
    Object.assign(prefs, defaultPrefs())
  }

  function expanded(group: Group) {
    return !collapsed.has(group)
  }

  function toggle(group: Group) {
    if (collapsed.has(group)) collapsed.delete(group)
    else collapsed.add(group)
  }

  function find(id: string) {
    return skills.value.find((skill) => skill.id === id) ?? null
  }

  function read(skill: Skill) {
    return skillsRead(AGENT, skill.id)
  }

  async function reveal(skill: Skill) {
    try {
      await skillsReveal(AGENT, skill.id)
    } catch (error) {
      fail('settings.skills.revealFailed', skill.name, error)
    }
  }

  async function copy(skill: Skill) {
    try {
      await navigator.clipboard.writeText(skill.path)
      return true
    } catch {
      return false
    }
  }

  async function save(skill: Skill, content: string) {
    try {
      await skillsWrite(AGENT, skill.id, content)
      dirty.value = false
      await loadSkills()
      return true
    } catch (error) {
      fail('settings.skills.saveFailed', skill.name, error)
      return false
    }
  }

  async function trash(skill: Skill) {
    const { t } = i18nGlobal()
    const confirmed = await useDialogStore().confirm({
      title: t('settings.skills.deleteTitle', { name: skill.name }),
      message: t('settings.skills.deleteMessage', { agent: AGENT_NAME }),
      confirmLabel: t('settings.skills.deleteConfirm'),
      danger: true,
    })
    if (!confirmed) return false
    trashing.value = skill.id
    try {
      await skillsTrash(AGENT, skill.id)
    } catch (error) {
      fail('settings.skills.deleteFailed', skill.name, error)
      return false
    } finally {
      trashing.value = null
    }
    if (previewed.value?.id === skill.id) close(true)
    delete prefs.skills[skill.id]
    skills.value = skills.value.filter((item) => item.id !== skill.id)
    useToastsStore().push({ kind: 'success', title: t('settings.skills.deleted', { name: skill.name }), body: t('settings.skills.deletedBody') })
    return true
  }

  function update(server: McpServer) {
    servers.value = servers.value.map((item) => (item.name === server.name ? server : item))
  }

  async function reconnect(name: string) {
    if (pending.has(name)) return
    pending.add(name)
    try {
      update(await mcpCheck(AGENT, name))
    } catch (error) {
      fail('settings.skills.reconnectFailed', name, error)
    } finally {
      pending.delete(name)
    }
  }

  // Autorisation (OAuth) dans le navigateur. Recliquer pendant l'attente l'annule.
  async function connect(name: string) {
    if (logins.has(name)) {
      logins.delete(name)
      await mcpCancelLogin(name)
      return
    }
    if (pending.has(name)) return
    pending.add(name)
    logins.add(name)
    try {
      update(await mcpLogin(AGENT, name))
    } catch (error) {
      if (logins.has(name)) fail('settings.skills.connectFailed', name, error)
    } finally {
      pending.delete(name)
      logins.delete(name)
    }
  }

  function fail(key: string, name: string, error: unknown) {
    const { t } = i18nGlobal()
    useToastsStore().push({ kind: 'error', title: t(key, { name }), body: message(error) })
  }

  // Un autre skill ouvert avec des modifications non enregistrées fait demander d'abord.
  async function preview(skill: Skill) {
    if (previewed.value?.id === skill.id) return true
    if (!(await confirmClose())) return false
    previewed.value = skill
    return true
  }

  async function edit(skill: Skill) {
    if (await preview(skill)) editing.value = true
  }

  // Ferme le panneau, ou seulement l'éditeur (`editorOnly`). Des modifications non enregistrées font
  // demander d'abord : `false` si l'utilisateur les garde.
  async function confirmClose(editorOnly = false) {
    if (dirty.value) {
      const { t } = i18nGlobal()
      const discard = await useDialogStore().confirm({
        title: t('settings.skills.discardTitle'),
        message: t('settings.skills.discardMessage', { name: previewed.value?.name ?? '' }),
        confirmLabel: t('settings.skills.discardConfirm'),
        danger: true,
      })
      if (!discard) return false
    }
    dirty.value = false
    editing.value = false
    if (!editorOnly) previewed.value = null
    return true
  }

  // Sans question : rien n'est fermé si l'éditeur a des modifications, sauf `force`.
  function close(force = false) {
    if (dirty.value && !force) return
    dirty.value = false
    editing.value = false
    previewed.value = null
  }

  return {
    agentName: AGENT_NAME,
    skills,
    names,
    servers,
    loaded,
    loading,
    checking,
    errors,
    pending,
    logins,
    trashing,
    previewed,
    editing,
    draft,
    dirty,
    prefs,
    scope,
    load, refresh,
    loadSkills,
    loadServers,
    mode,
    differs,
    setMode,
    serverOn,
    serverLocked,
    setServer,
    findServer,
    exclusions,
    reset,
    expanded,
    toggle,
    find,
    read,
    reveal,
    copy,
    save,
    trash,
    reconnect,
    connect,
    preview,
    edit,
    confirmClose,
    close,
  }
})
