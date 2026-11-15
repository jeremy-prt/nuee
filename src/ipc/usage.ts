import { invoke } from '@tauri-apps/api/core'
import type { QuotaSample } from '@/ipc/bindings/QuotaSample'
import type { UsageBucket } from '@/ipc/bindings/UsageBucket'

// Tokens et coût au tarif de l'API depuis `since`, par pas de `step` ms et par modèle, lus dans les transcripts.
export function usageHistory(since: number, step: number) {
  return invoke<UsageBucket[]>('usage_history', { since, step })
}

// Combien vaut un dollar dans `currency` (EUR, BRL, JPY, CNY) ; null : on reste en dollars.
export function usageRate(currency: string) {
  return invoke<number | null>('usage_rate', { currency })
}

export function usageRecord(sample: QuotaSample) {
  return invoke<void>('usage_record', { sample })
}

// Relevés de quota depuis `since`, du plus ancien au plus récent.
export function usageSamples(since: number) {
  return invoke<QuotaSample[]>('usage_samples', { since })
}
