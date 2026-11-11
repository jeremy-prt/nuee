import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { ChatItem, ToolItem } from '@/stores/conversations'

export type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>
export type ActivityItem = ToolItem | ThinkingItem

export type FileVerb = 'created' | 'read' | 'edited'

// Une partie du résumé d'une suite d'outils. `files` : opérations sur des fichiers, `name` s'il n'y en a qu'un.
export type SummaryPart =
  | { kind: 'count'; tool: Exclude<ToolKind, 'read' | 'edit'>; n: number; failed: number }
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
    const kind = tool.tool as Exclude<ToolKind, 'read' | 'edit'>
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
    return { doing: item.tool, description: item.detail?.description ?? null, name: null }
  }
  return null
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
