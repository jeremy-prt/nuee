// Teintes des projets (jetons `--project-*` de main.css). La première, neutre, n'est jamais tirée au hasard.
export const projectColors = ['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet'] as const

export type ProjectColor = (typeof projectColors)[number]

export function isProjectColor(value: unknown): value is ProjectColor {
  return projectColors.includes(value as ProjectColor)
}

function hash(text: string) {
  let value = 0
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0
  return value
}

// Couleur de départ tirée du nom : deux projets aux noms différents ont peu de chances de se ressembler.
export function colorFromName(name: string): ProjectColor {
  return projectColors[(hash(name) % (projectColors.length - 1)) + 1] ?? 'blue'
}

export function colorVar(color: ProjectColor) {
  return `var(--project-${color})`
}

// Même règle que `branch` dans services/worktree.rs.
export function worktreeBranch(chatId: string) {
  return `nuee/${chatId.slice(0, 8)}`
}

// Mascottes dessinées dans src/assets/mascots : teintées par les variables de `.mascot` (main.css), leurs `id`
// commencent par `__ID__`, remplacé par instance (plusieurs mascottes de couleurs différentes sur une page).
const files = import.meta.glob<string>('@/assets/mascots/*.svg', { query: '?raw', import: 'default', eager: true })
const svgs: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), svg]),
)

export const mascotIds = ['nuage', 'brouillard', 'pluie', 'orage', 'lune', 'tourbillon', 'vent', 'eclaircie'].filter((id) => id in svgs)

export function mascotSvg(id: string, instance: string) {
  return (svgs[id] ?? svgs[mascotIds[0] ?? ''] ?? '').replaceAll('__ID__', instance)
}

// Tirée de l'id : elle ne change pas quand on renomme le projet.
export function mascotOf(projectId: string) {
  return mascotIds[hash(projectId) % mascotIds.length] ?? ''
}

// Chemin affiché avec `~` pour le dossier personnel : la fin du chemin, qui distingue les projets, reste visible.
export function shortPath(path: string) {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
}
