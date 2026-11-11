export type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'same'; text: string; old: number | null; new: number | null }

// Lignes d'un diff unifié qui commence au premier `@@`, numérotées dans l'ancienne et la nouvelle version.
export function diffLines(patch: string): DiffLine[] {
  const rows: DiffLine[] = []
  let old = 0
  let now = 0
  for (const raw of patch.split('\n')) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      old = Number(hunk[1])
      now = Number(hunk[2])
      if (rows.length) rows.push({ kind: 'hunk', text: '', old: null, new: null })
    } else if (raw.startsWith('+')) rows.push({ kind: 'add', text: raw.slice(1), old: null, new: now++ })
    else if (raw.startsWith('-')) rows.push({ kind: 'del', text: raw.slice(1), old: old++, new: null })
    else rows.push({ kind: 'same', text: raw.slice(1), old: old++, new: now++ })
  }
  return rows
}

// Index de la première ligne de chaque changement : une suite de lignes ajoutées ou retirées, comme monocode.
export function changeStarts(lines: readonly DiffLine[]): number[] {
  const starts: number[] = []
  lines.forEach((line, index) => {
    const changed = line.kind === 'add' || line.kind === 'del'
    const previous = lines[index - 1]
    if (changed && !(previous && (previous.kind === 'add' || previous.kind === 'del'))) starts.push(index)
  })
  return starts
}
