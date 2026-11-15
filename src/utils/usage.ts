import type { Quota } from '@/ipc/bindings/Quota'
import type { QuotaSample } from '@/ipc/bindings/QuotaSample'
import type { UsageBucket } from '@/ipc/bindings/UsageBucket'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

// Une teinte douce par famille (celles des projets, même clarté) : les couleurs d'état restent aux limites.
const FAMILIES = [
  { match: 'opus', color: 'var(--project-blue)' },
  { match: 'fable', color: 'var(--project-orange)' },
  { match: 'sonnet', color: 'var(--project-teal)' },
  { match: 'haiku', color: 'var(--project-pink)' },
]

export function modelColor(model: string) {
  const name = model.toLowerCase()
  return FAMILIES.find((family) => name.includes(family.match))?.color ?? 'color-mix(in oklab, var(--color-content) 35%, transparent)'
}

// `claude-opus-5-5` → « Opus 5.5 », `claude-haiku-4-5-20251001` → « Haiku 4.5 ».
export function modelLabel(model: string) {
  const parts = model
    .replace(/^claude-/, '')
    .split('-')
    .filter((part) => !/^\d{8}$/.test(part))
  const [family, ...version] = parts
  if (!family) return model
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return version.length ? `${name} ${version.join('.')}` : name
}

export function bucketTokens(bucket: UsageBucket) {
  return bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite
}

export interface Totals {
  tokens: number
  cost: number
  // Une partie des tokens vient d'un modèle absent de la grille de prix.
  unpriced: boolean
}

export function totals(buckets: UsageBucket[]): Totals {
  return buckets.reduce<Totals>(
    (sum, bucket) => ({
      tokens: sum.tokens + bucketTokens(bucket),
      cost: sum.cost + (bucket.cost ?? 0),
      unpriced: sum.unpriced || bucket.cost === null,
    }),
    { tokens: 0, cost: 0, unpriced: false },
  )
}

export interface ModelRow extends Totals {
  model: string
  label: string
  color: string
  share: number
}

// Du plus coûteux au moins coûteux ; la part se lit sur le coût.
export function byModel(buckets: UsageBucket[]): ModelRow[] {
  const groups = new Map<string, UsageBucket[]>()
  for (const bucket of buckets) groups.set(bucket.model, [...(groups.get(bucket.model) ?? []), bucket])
  const rows = [...groups].map(([model, list]) => ({ model, label: modelLabel(model), color: modelColor(model), share: 0, ...totals(list) }))
  const cost = rows.reduce((sum, row) => sum + row.cost, 0)
  for (const row of rows) row.share = cost > 0 ? row.cost / cost : 0
  return rows.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)
}

export type Metric = 'cost' | 'tokens'

export interface Column {
  start: number
  end: number
  // Valeur par modèle, dans l'ordre de `models`.
  values: number[]
  total: number
}

// Une colonne par heure (une journée) ou par jour local, vides comprises : un jour sans session reste visible.
export function columns(buckets: UsageBucket[], since: number, now: number, hourly: boolean, models: string[], metric: Metric): Column[] {
  const starts: number[] = []
  const first = new Date(since)
  if (hourly) first.setMinutes(0, 0, 0)
  else first.setHours(0, 0, 0, 0)
  for (const cursor = first; cursor.getTime() <= now; hourly ? cursor.setHours(cursor.getHours() + 1) : cursor.setDate(cursor.getDate() + 1)) {
    starts.push(cursor.getTime())
  }
  const list = starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? (hourly ? start + HOUR : start + DAY),
    values: models.map(() => 0),
    total: 0,
  }))
  for (const bucket of buckets) {
    const after = list.findIndex((column) => column.start > bucket.at)
    const column = list[(after < 0 ? list.length : after) - 1]
    if (!column) continue
    const value = metric === 'cost' ? (bucket.cost ?? 0) : bucketTokens(bucket)
    const index = models.indexOf(bucket.model)
    if (index >= 0) column.values[index]! += value
    column.total += value
  }
  return list
}

export interface Window {
  key: string
  // Nom du modèle de la fenêtre (`Fable`), null pour une fenêtre commune à tous.
  model: string | null
  duration: number
  quota: Quota
}

export interface Pace {
  start: number
  end: number
  // Part de la fenêtre écoulée, de 0 à 1.
  elapsed: number
}

// `null` : la fenêtre n'a pas de remise à zéro (pas de session de 5 h en cours).
export function pace(window: Window, now: number): Pace | null {
  const end = window.quota.resetsAt
  if (end === null) return null
  const start = end - window.duration
  return { start, end, elapsed: Math.min(1, Math.max(0, (now - start) / window.duration)) }
}

export function windowMatches(window: Window, model: string) {
  return window.model === null || model.toLowerCase().includes(window.model.toLowerCase())
}

// Relevés de cette fenêtre-ci : une remise à zéro qui bouge de quelques minutes d'un relevé à l'autre reste la même.
export function windowSamples(window: Window, samples: QuotaSample[], start: number, now: number) {
  const end = window.quota.resetsAt
  return samples.filter(
    (sample) =>
      sample.window === window.key && sample.at > start && sample.at < now && (sample.resetsAt === null || end === null || Math.abs(sample.resetsAt - end) < 3 * HOUR),
  )
}

// Courbe de la fenêtre : elle passe par les relevés mesurés (début à 0, relevés, quota actuel). Entre deux relevés, la
// hausse est répartie au prorata du coût des tokens de cet ordinateur, à défaut en ligne droite.
export function paceCurve(window: Window, buckets: UsageBucket[], samples: QuotaSample[], start: number, now: number, step: number) {
  const anchors = [{ at: start, used: 0 }]
  for (const sample of windowSamples(window, samples, start, now)) anchors.push({ at: sample.at, used: Math.max(anchors.at(-1)!.used, sample.used) })
  anchors.push({ at: now, used: Math.max(anchors.at(-1)!.used, window.quota.used) })

  const spent = buckets.filter((bucket) => windowMatches(window, bucket.model)).sort((a, b) => a.at - b.at)
  const points = [anchors[0]!]
  for (let index = 1; index < anchors.length; index++) {
    const a = anchors[index - 1]!
    const b = anchors[index]!
    const inside = spent.filter((bucket) => bucket.at + step > a.at && bucket.at < b.at)
    const total = inside.reduce((sum, bucket) => sum + (bucket.cost ?? 0), 0)
    if (total > 0) {
      let sum = 0
      for (const bucket of inside) {
        const from = Math.max(a.at, bucket.at)
        if (points.at(-1)!.at < from) points.push({ at: from, used: a.used + ((b.used - a.used) * sum) / total })
        sum += bucket.cost ?? 0
        const to = Math.min(b.at, bucket.at + step)
        const value = a.used + ((b.used - a.used) * sum) / total
        if (points.at(-1)!.at === to) points.at(-1)!.used = value
        else points.push({ at: to, used: value })
      }
    }
    if (points.at(-1)!.at === b.at) points.at(-1)!.used = b.used
    else points.push(b)
  }
  return points
}
