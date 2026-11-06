import { FileText, GitCompare, Globe, Layers, LayoutDashboard, SquareTerminal } from '@/components/ui/icons'
import type { DockView } from '@/stores/layout'

// Même icône dans la barre de titre et en tête du volet.
export const dockIcons: Record<DockView, typeof Layers> = {
  session: LayoutDashboard,
  tasks: Layers,
  terminal: SquareTerminal,
  changes: GitCompare,
  browser: Globe,
  files: FileText,
}
