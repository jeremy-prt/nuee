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

// Couleurs de l'initiale d'un projet (jetons `--icon-*` de main.css). Le gris n'est jamais tiré au hasard.
export const iconColors = ['slate', 'blue', 'sky', 'teal', 'emerald', 'indigo', 'violet', 'pink', 'red', 'orange'] as const

export type IconColor = (typeof iconColors)[number]

export function isIconColor(value: unknown): value is IconColor {
  return iconColors.includes(value as IconColor)
}

export function iconColorVar(color: IconColor) {
  return `var(--icon-${color})`
}

// Couleur de départ tirée du nom : deux projets aux noms différents ont peu de chances de se ressembler.
export function colorFromName(name: string): IconColor {
  return iconColors[(hash(name) % (iconColors.length - 1)) + 1] ?? 'blue'
}

export function colorVar(color: ProjectColor) {
  return `var(--project-${color})`
}

// Fond d'une ligne teintée (projet, groupe), comme les onglets de Brume : toujours là, plus fort au survol et
// quand la ligne est active.
export function rowTint(color: ProjectColor) {
  const mix = (amount: number) => `color-mix(in srgb, ${colorVar(color)} ${amount}%, transparent)`
  return { '--row-rest': mix(12), '--row-hover': mix(19), '--row-active': mix(28) }
}

// Même règle que `branch` dans services/worktree.rs.
export function worktreeBranch(chatId: string) {
  return `nuee/${chatId.slice(0, 8)}`
}
