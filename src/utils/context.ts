import type { ContextCategory } from '@/ipc/bindings/ContextCategory'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'

// Les plus grosses parts en couleur, comme l'app Claude ; les petites restent grises pour ne pas faire arc-en-ciel.
const PALETTE = ['bg-info', 'bg-orange', 'bg-success', 'bg-warning']

export interface ContextRow extends ContextCategory {
  color: string
  share: string
  width: string
}

export function contextFormats(locale: string) {
  return {
    percent: new Intl.NumberFormat(locale, { style: 'percent' }),
    share: new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    tokens: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
  }
}

export function contextRatio(usage: ContextUsage) {
  return Math.min(1, usage.used / usage.window)
}

export function contextRows(usage: ContextUsage, formats: ReturnType<typeof contextFormats>) {
  const byKind = (kind: ContextCategory['kind']) => usage.categories.filter((category) => category.kind === kind)
  const used = [...byKind('used')].sort((a, b) => b.tokens - a.tokens)
  const row = (category: ContextCategory, color: string): ContextRow => ({
    ...category,
    color,
    share: category.kind === 'deferred' ? '—' : formats.share.format(category.tokens / usage.window),
    width: `${(category.tokens / usage.window) * 100}%`,
  })
  return {
    filled: [
      ...used.map((category, i) => row(category, PALETTE[i] ?? 'bg-content/40')),
      ...byKind('buffer').map((category) => row(category, 'bg-content/25')),
    ],
    free: byKind('free').map((category) => row(category, 'bg-content/10')),
    deferred: byKind('deferred').map((category) => row(category, 'bg-content/25')),
  }
}
