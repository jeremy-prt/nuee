import type { ChatItem, TaskState, ToolItem } from '@/stores/conversations'

export type TaskEntry = { tool: ToolItem; task: TaskState }

// Tâches d'une conversation (sous-agents, commandes en arrière-plan), les plus récentes d'abord.
export function tasksOf(items: readonly ChatItem[]): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const item of items) if (item.kind === 'tool' && item.task) out.push({ tool: item, task: item.task })
  return out.reverse()
}
