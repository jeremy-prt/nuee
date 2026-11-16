import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { ChatItem, ToolItem } from '@/stores/conversations'

export type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>
export type ActivityItem = ToolItem | ThinkingItem

export type FileVerb = 'created' | 'read' | 'edited'
export type SummaryTool = Exclude<ToolKind, 'read' | 'edit'> | 'page' | 'session'

// Une partie du résumé d'une suite d'outils. `files` : opérations sur des fichiers, `name` s'il n'y en a qu'un.
export type SummaryPart =
  | { kind: 'count'; tool: SummaryTool; n: number; failed: number }
  | { kind: 'files'; verbs: FileVerb[]; n: number; name: string | null }

export function fileVerb(item: ToolItem): FileVerb | null {
  if (item.tool === 'read') return 'read'
  if (item.tool !== 'edit') return null
  return item.change?.created || (!item.change && item.name === 'Write') ? 'created' : 'edited'
}

export function capitalize(text: string, locale: string) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

// Résumé à la manière de l'app Claude : « exécuté 4 commandes (1 échec), créé, lu et modifié notes.txt ». Les
// familles suivent leur première apparition ; un seul fichier touché réunit ses verbes, sinon chaque verbe compte
// ses fichiers.
export function summarize(items: readonly ActivityItem[]) {
  const tools = items.filter((item): item is ToolItem => item.kind === 'tool')
  const files = new Set(tools.flatMap((tool) => (fileVerb(tool) && tool.summary ? [tool.summary] : [])))
  const parts: SummaryPart[] = []
  let added = 0
  let removed = 0
  let failedFiles = 0
  for (const tool of tools) {
    added += tool.change?.added ?? 0
    removed += tool.change?.removed ?? 0
    const verb = fileVerb(tool)
    if (verb) {
      if (tool.status === 'failed') failedFiles++
      const single = files.size <= 1
      const part = parts.find((part) => part.kind === 'files' && (single || part.verbs[0] === verb))
      if (part?.kind === 'files') {
        if (!part.verbs.includes(verb)) part.verbs.push(verb)
      } else parts.push({ kind: 'files', verbs: [verb], n: 0, name: null })
      continue
    }
    const kind = family(tool)
    if (!kind) continue
    const part = parts.find((part) => part.kind === 'count' && part.tool === kind)
    const failed = tool.status === 'failed' ? 1 : 0
    if (part?.kind === 'count') {
      part.n++
      part.failed += failed
    } else parts.push({ kind: 'count', tool: kind, n: 1, failed })
  }
  for (const part of parts) {
    if (part.kind !== 'files') continue
    const touched = new Set(
      tools.flatMap((tool) => {
        const verb = fileVerb(tool)
        return verb && part.verbs.includes(verb) && tool.summary ? [tool.summary] : []
      }),
    )
    part.n = touched.size
    const [only] = touched
    part.name = touched.size === 1 && only ? fileName(only) : null
  }
  return { parts, added, removed, failedFiles }
}

// Dernière étape outillée, gardée jusqu'à la suivante : la ligne vivante de `ChatActivity` et le bouton d'une action
// git de fond. `doing` : clé sous `chat.activity.doing` ; `description` (donnée par l'agent) la remplace si présente.
export function lastStep(items: readonly ChatItem[]) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item?.kind !== 'tool') continue
    const verb = item.summary ? fileVerb(item) : null
    if (verb) return { doing: verb === 'created' ? 'create' : item.tool, description: null, name: fileName(item.summary ?? '') }
    if (item.tool === 'agent') return { doing: 'agent', description: null, name: null }
    // Outils de Nuée (navigateur, sessions) et chargement d'outils : leur propre libellé ; autre outil MCP : son nom.
    const own = ownTool(item.name)
    if (own) return { doing: item.tool, tool: own, description: item.detail?.description ?? null, name: null }
    const mcp = item.tool === 'other' && item.name.startsWith('mcp__') ? toolName(item.name) : null
    return { doing: item.tool, description: item.detail?.description ?? null, name: mcp }
  }
  return null
}

// Outils de Nuée qui ont un libellé sous `chat.activity.tools`, rangés par famille pour le résumé.
const PAGE_TOOLS = new Set([
  'navigate', 'computer', 'find', 'form_input', 'get_page_text', 'read_page', 'inspect', 'javascript_tool', 'read_console_messages',
  'read_network_requests', 'preview_start', 'preview_stop', 'preview_logs', 'preview_list', 'resize_window', 'scroll', 'browser_batch',
  'tabs_create', 'tabs_close', 'tabs_select', 'tabs_context', 'cursor',
])
const SESSION_TOOLS = new Set(['list_sessions', 'read_session', 'start_session', 'send_message', 'rename_session', 'archive_session'])

// Clé de libellé d'un outil connu de Nuée ; ToolSearch est le chargement des outils différés par Claude Code.
export function ownTool(name: string) {
  if (name === 'ToolSearch') return 'toolSearch'
  const own = name.startsWith('mcp__nuee__') ? name.slice(11) : null
  return own && (PAGE_TOOLS.has(own) || SESSION_TOOLS.has(own)) ? own : null
}

// Famille d'un outil dans le résumé : page, session, ou rien pour le chargement d'outils (sans intérêt une fois fait).
function family(item: ToolItem): SummaryTool | null {
  if (item.name === 'ToolSearch') return null
  const own = item.name.startsWith('mcp__nuee__') ? item.name.slice(11) : ''
  if (PAGE_TOOLS.has(own)) return 'page'
  if (SESSION_TOOLS.has(own)) return 'session'
  return item.tool as SummaryTool
}

// Libellé d'une étape : celui de l'outil de Nuée, sinon le verbe de son genre.
export function stepKey(step: { doing: string; tool?: string }) {
  return step.tool ? `chat.activity.tools.${step.tool}` : `chat.activity.doing.${step.doing}`
}

// Lignes ajoutées et retirées sur toute la session : enregistrées avec elle pour la liste des sessions.
export function sessionDiff(items: readonly ChatItem[]) {
  let added = 0
  let removed = 0
  for (const item of items) {
    if (item.kind !== 'tool' || !item.change) continue
    added += item.change.added
    removed += item.change.removed
  }
  return { added, removed }
}

export function countFailures(items: readonly ActivityItem[]) {
  return items.filter((item) => item.kind === 'tool' && item.status === 'failed').length
}

// Outil du serveur `nuee` qui lance une autre session : carte « Tâche » hors du pli d'activité.
export const START_SESSION = 'mcp__nuee__start_session'
// Plan de l'agent (outil `update_plan` du serveur `nuee`, la CLI n'ayant pas de TodoWrite en mode SDK).
export const UPDATE_PLAN = 'mcp__nuee__update_plan'

// Proposition de fin de tour (outil `propose_next`) : un résumé, une question, une ou deux réponses d'un clic.
export const PROPOSE_NEXT = 'mcp__nuee__propose_next'
export interface Proposal {
  recap: string | null
  question: string
  options: string[]
}

export function proposalOf(item: ChatItem | undefined): Proposal | null {
  if (item?.kind !== 'tool' || item.name !== PROPOSE_NEXT || !item.detail?.text) return null
  try {
    const value: { recap?: unknown; question?: unknown; options?: unknown } = JSON.parse(item.detail.text)
    const options = Array.isArray(value.options) ? value.options.filter((option): option is string => typeof option === 'string' && !!option.trim()).slice(0, 2) : []
    if (typeof value.question !== 'string' || !value.question.trim() || !options.length) return null
    return { recap: typeof value.recap === 'string' && value.recap.trim() ? value.recap : null, question: value.question, options }
  } catch {
    return null
  }
}

export type PlanStatus = 'pending' | 'in_progress' | 'completed'
export interface PlanStep {
  content: string
  status: PlanStatus
}

// La liste vient de l'appel lui-même (`detail.text`, en JSON) ; un appel mal formé ne donne rien.
export function planOf(item: ChatItem | undefined): PlanStep[] | null {
  if (item?.kind !== 'tool' || item.name !== UPDATE_PLAN || !item.detail?.text) return null
  try {
    const steps: unknown = JSON.parse(item.detail.text)
    if (!Array.isArray(steps)) return null
    const valid = steps.filter(
      (step): step is PlanStep => typeof step?.content === 'string' && ['pending', 'in_progress', 'completed'].includes(step?.status),
    )
    return valid.length ? valid : null
  } catch {
    return null
  }
}

// `mcp__github__create_issue` devient « github › create_issue ».
export function toolName(name: string) {
  const parts = name.split('__')
  return parts[0] === 'mcp' && parts.length >= 3 ? `${parts[1]} › ${parts.slice(2).join('__')}` : name
}

// « claude-haiku-5-5 » -> « Haiku 5.5 » : le dernier mot du nom, puis les chiffres de la version.
export function modelName(id: string) {
  const parts = id.split(/[-_]/)
  const word = parts.filter((part) => /^[a-z]+$/i.test(part)).at(-1)
  const version = parts.filter((part) => /^\d+$/.test(part)).slice(0, 2).join('.')
  return word ? [word.charAt(0).toUpperCase() + word.slice(1), version].filter(Boolean).join(' ') : id
}
