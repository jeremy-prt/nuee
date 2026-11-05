import { FileText, GitCompare, Globe, Layers, SquareTerminal } from '@/components/ui/icons'
import type { DockView } from '@/stores/layout'

// Même icône dans la barre de titre et en tête du volet.
export const dockIcons: Record<DockView, typeof Layers> = {
  tasks: Layers,
  terminal: SquareTerminal,
  changes: GitCompare,
  browser: Globe,
  files: FileText,
}
