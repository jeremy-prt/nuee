import { FolderTree, GitCompare, Globe, Layers, SquareTerminal } from '@/components/ui/icons'
import type { DockView } from '@/stores/layout'

// Même icône dans les onglets du panneau, son lanceur et son menu « + ».
export const dockIcons: Record<DockView, typeof Layers> = {
  tasks: Layers,
  terminal: SquareTerminal,
  changes: GitCompare,
  browser: Globe,
  files: FolderTree,
}
