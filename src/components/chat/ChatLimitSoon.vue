<script setup lang="ts">
import { chatCard } from '@/components/chat/card'
import { Clock, X } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Quota } from '@/ipc/bindings/Quota'
import { useAgentsStore } from '@/stores/agents'

// Comme l'app Claude : au-dessus du champ d'une conversation lancée, un quota presque épuisé avec l'heure de remise à zéro. Fermé, il revient
// à la fenêtre de quota suivante (clé = quota + remise à zéro).
const SOON = 0.8
const STORAGE_KEY = 'nuee.limitSoon.dismissed.v1'

const props = defineProps<{ agent: AgentKind }>()

const { t, locale } = useI18n()
const agents = useAgentsStore()

function load(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string').slice(-20) : []
  } catch {
    return []
  }
}
const dismissed = ref(load())

// Le quota le plus entamé passé le seuil ; l'hebdomadaire l'emporte à égalité, il bloque plus longtemps.
const warning = computed(() => {
  const usage = agents.status[props.agent].usage
  if (!usage) return null
  const candidates: { which: 'weekly' | 'session' | 'model'; quota: Quota; model?: string }[] = []
  if (usage.weekly) candidates.push({ which: 'weekly', quota: usage.weekly })
  for (const item of usage.models) candidates.push({ which: 'model', quota: item.quota, model: item.model })
  if (usage.session) candidates.push({ which: 'session', quota: usage.session })
  const worst = candidates.filter(({ quota }) => quota.used >= SOON && quota.used < 1).sort((a, b) => b.quota.used - a.quota.used)[0]
  if (!worst) return null
  // L'heure de remise à zéro varie d'une minute d'un relevé à l'autre : arrondie à l'heure, elle désigne la même fenêtre.
  const window = worst.quota.resetsAt ? Math.round(worst.quota.resetsAt / 3_600_000) : ''
  const key = `${props.agent}:${worst.which}:${worst.model ?? ''}:${window}`
  return dismissed.value.includes(key) ? null : { ...worst, key }
})

const title = computed(() => {
  const current = warning.value
  if (!current) return ''
  return current.which === 'model' ? t('chat.limitSoon.model', { model: current.model }) : t(`chat.limitSoon.${current.which}`)
})
const resets = computed(() => {
  const at = warning.value?.quota.resetsAt
  if (!at) return null
  const date = new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at)
  return t('chat.limitSoon.resets', { date })
})
const percent = computed(() => new Intl.NumberFormat(locale.value, { style: 'percent' }).format(warning.value?.quota.used ?? 0))

function dismiss() {
  const current = warning.value
  if (!current) return
  dismissed.value = [...dismissed.value, current.key].slice(-20)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed.value))
  } catch {
    // Stockage refusé : fermé jusqu'au prochain lancement seulement.
  }
}
</script>

<template>
  <section v-if="warning" :class="chatCard" class="flex w-full items-center gap-2.5 py-1.5 ps-3 pe-1.5 text-xs" role="status">
    <Clock class="size-4 shrink-0 text-warning" aria-hidden="true" />
    <p class="min-w-0 flex-1 truncate">
      <span class="text-[13px] text-content">{{ title }}</span>
      <span class="ms-2 text-warning tabular-nums">{{ percent }}</span>
      <span v-if="resets" class="ms-2 text-muted">{{ resets }}</span>
    </p>
    <UiIconButton :label="t('chat.limitSoon.dismiss')" @click="dismiss">
      <X class="size-3.5" aria-hidden="true" />
    </UiIconButton>
  </section>
</template>
