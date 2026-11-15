import type { CleanupGroup } from '@/ipc/bindings/CleanupGroup'
import type { CleanupProcess } from '@/ipc/bindings/CleanupProcess'

// Catégories que le bouton peut arrêter, seules affichées : terminaux et app, que Rust relève aussi, sont écartés.
export type Cleanable = Exclude<CleanupGroup, 'terminals' | 'app'>
export const CLEANABLE: Cleanable[] = ['leftovers', 'others', 'agents', 'servers']

export function isCleanable(group: CleanupGroup): group is Cleanable {
  return (CLEANABLE as CleanupGroup[]).includes(group)
}

export interface GroupTotal {
  memory: number
  // Process que le nettoyage arrêterait dans ce groupe (les agents au repos seulement).
  cleanable: number
  cleanableMemory: number
  idleAgents: number
}

export function stoppable(process: CleanupProcess) {
  return process.group === 'agents' ? process.idle : isCleanable(process.group)
}

export function groupTotals(processes: CleanupProcess[]) {
  const totals = Object.fromEntries(
    CLEANABLE.map((group) => [group, { memory: 0, cleanable: 0, cleanableMemory: 0, idleAgents: 0 }]),
  ) as Record<Cleanable, GroupTotal>
  for (const process of processes) {
    if (!isCleanable(process.group)) continue
    const total = totals[process.group]
    total.memory += process.memory
    if (stoppable(process)) {
      total.cleanable++
      total.cleanableMemory += process.memory
    }
  }
  totals.agents.idleAgents = processes.filter((process) => process.group === 'agents' && process.idle && process.head).length
  return totals
}

const GIB = 1024 ** 3
const MIB = 1024 ** 2

// Unités binaires, comme le Moniteur d'activité : Go au-delà de 1 Go, Mo en dessous.
export function formatBytes(bytes: number, locale: string) {
  if (bytes >= GIB) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: bytes >= 10 * GIB ? 0 : 1 }).format(bytes / GIB)
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(Math.max(bytes, 0) / MIB)
}
