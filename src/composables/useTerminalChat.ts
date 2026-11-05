import { computed } from 'vue'
import type { Place } from '@/stores/conversations'
import { useProjectsStore } from '@/stores/projects'
import { useWorkspaceStore } from '@/stores/workspace'

// Session dont le volet Terminal montre les shells : celle du panneau qui a le focus, et l'endroit où travaille son agent.
export function useTerminalChat() {
  const workspace = useWorkspaceStore()
  const projects = useProjectsStore()

  const chat = computed(() => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? null)
  const place = computed<Place | null>(() => {
    const tab = chat.value
    if (!tab) return null
    const project = projects.byId(tab.projectId)
    const worktree = !!project && tab.worktree
    return { cwd: project?.path ?? null, worktree, worktreePath: worktree ? tab.worktreePath : null }
  })

  return { chat, place }
}
