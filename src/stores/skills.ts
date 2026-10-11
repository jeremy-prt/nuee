import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'

export interface Skill {
  id: string
  name: string
  description: string
  // Fichier SKILL.md du skill.
  path: string
}

export interface McpServer {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse'
  // Commande lancée (stdio) ou adresse du serveur (http, sse).
  target: string
  status: 'connected' | 'needsAuth' | 'failed'
  tools: number | null
  error: string | null
}

const STORAGE_KEY = 'nuee.skills.v1'
type Kind = 'skills' | 'servers'

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
    return { skills: list(saved.skills), servers: list(saved.servers), collapsed: list(saved.collapsed) as Kind[] }
  } catch {
    return { skills: [], servers: [], collapsed: [] as Kind[] }
  }
}

// Maquette en attendant les commandes Rust (lecture des skills et des serveurs MCP de la config globale
// de l'agent, lecture d'un SKILL.md, ouverture dans le Finder, connexion d'un serveur) : seules les
// fonctions ci-dessous simulent.
function scan() {
  const skill = (name: string, description: string): Skill => ({ id: name, name, description, path: `~/.claude/skills/${name}/SKILL.md` })
  const skills: Skill[] = [
    skill('code-review', 'Review the current diff for bugs, security issues and dead code, then fix what is safe.'),
    skill('commit', 'Write a commit message from the staged changes and push to the right remote.'),
    skill('release-notes', 'Write release notes from the commits since the last tag, grouped by feature and fix.'),
    skill('changelog', 'Keep CHANGELOG.md in sync with the merged pull requests.'),
    skill('frontend-design', 'Build distinctive, production-grade interfaces that avoid generic AI aesthetics.'),
    skill('pdf', 'Read, merge, split, fill or create PDF files.'),
    skill('stack-check', 'Look up the latest stable version of a library before installing it.'),
    skill('tests', 'Write the missing tests for the code that just changed, then run them.'),
  ]
  const servers: McpServer[] = [
    { id: 'github', name: 'github', transport: 'stdio', target: 'npx -y @modelcontextprotocol/server-github', status: 'connected', tools: 26, error: null },
    { id: 'notion', name: 'notion', transport: 'http', target: 'https://mcp.notion.com/mcp', status: 'needsAuth', tools: null, error: null },
    { id: 'figma', name: 'figma', transport: 'http', target: 'https://mcp.figma.com/mcp', status: 'connected', tools: 14, error: null },
    { id: 'postgres', name: 'postgres', transport: 'stdio', target: 'npx -y @modelcontextprotocol/server-postgres', status: 'failed', tools: null, error: 'process exited with code 1' },
  ]
  return new Promise<{ skills: Skill[]; servers: McpServer[] }>((resolve) => setTimeout(() => resolve({ skills, servers }), 500))
}

function readSkill(skill: Skill) {
  const text = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\n${skill.description}\n\n## Steps\n\n1. Read the files the task touches before writing anything.\n2. Do the work in small steps and check each one.\n3. Finish with a short summary of what changed.\n\n## Rules\n\n- Never invent a command or a path: check that it exists.\n- Ask before anything that cannot be undone.\n`
  return new Promise<string>((resolve) => setTimeout(() => resolve(text), 200))
}

function revealPath(_path: string) {}

function authenticate() {
  return new Promise<number>((resolve) => setTimeout(() => resolve(9), 1200))
}

// Skills et serveurs MCP de la config globale de l'agent. Ceux que Nuée ne lui donne pas et les listes
// repliées sont gardés en localStorage.
export const useSkillsStore = defineStore('skills', () => {
  const loading = ref(false)
  const skills = ref<Skill[]>([])
  const servers = ref<McpServer[]>([])
  const prefs = reactive(loadPrefs())
  const pending = reactive(new Set<string>())
  // Skill ouvert dans le panneau de droite des réglages.
  const previewed = ref<Skill | null>(null)

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

  async function load() {
    if (loading.value) return
    loading.value = true
    try {
      const found = await scan()
      skills.value = found.skills
      servers.value = found.servers
    } finally {
      loading.value = false
    }
  }

  function enabled(kind: Kind, id: string) {
    return !prefs[kind].includes(id)
  }

  function setEnabled(kind: Kind, id: string, value: boolean) {
    prefs[kind] = value ? prefs[kind].filter((item) => item !== id) : [...prefs[kind], id]
  }

  function expanded(kind: Kind) {
    return !prefs.collapsed.includes(kind)
  }

  function toggle(kind: Kind) {
    prefs.collapsed = expanded(kind) ? [...prefs.collapsed, kind] : prefs.collapsed.filter((item) => item !== kind)
  }

  // Contenu du SKILL.md, sans l'en-tête YAML que la page montre déjà (nom, description).
  async function read(skill: Skill) {
    return (await readSkill(skill)).replace(/^---\n[\s\S]*?\n---\n+/, '')
  }

  function reveal(skill: Skill) {
    revealPath(skill.path)
  }

  async function copy(skill: Skill) {
    try {
      await navigator.clipboard.writeText(skill.path)
      return true
    } catch {
      return false
    }
  }

  // Connexion (OAuth du serveur) ou reconnexion d'un serveur tombé.
  async function connect(id: string) {
    const server = servers.value.find((item) => item.id === id)
    if (!server || pending.has(id)) return
    pending.add(id)
    try {
      server.tools = await authenticate()
      server.status = 'connected'
      server.error = null
    } finally {
      pending.delete(id)
    }
  }

  function preview(skill: Skill | null) {
    previewed.value = skill
  }

  return { loading, skills, servers, pending, previewed, preview, load, enabled, setEnabled, expanded, toggle, read, reveal, copy, connect }
})
