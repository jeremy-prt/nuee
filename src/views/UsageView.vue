<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info, RefreshCw } from '@/components/ui/icons'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import UsagePaceChart from '@/components/usage/UsagePaceChart.vue'
import UsageModels from '@/components/usage/UsageModels.vue'
import UsageQuotaCard from '@/components/usage/UsageQuotaCard.vue'
import UsageSpendChart from '@/components/usage/UsageSpendChart.vue'
import { useSlow } from '@/composables/useSlow'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { UsageBucket } from '@/ipc/bindings/UsageBucket'
import type { QuotaSample } from '@/ipc/bindings/QuotaSample'
import { usageHistory, usageSamples } from '@/ipc/usage'
import { useAgentsStore } from '@/stores/agents'
import { agents, defaultAgent } from '@/utils/agents'
import { byModel, columns, DAY, HOUR, MINUTE, pace, totals, type Window } from '@/utils/usage'

type Tab = 'limits' | 'cost' | 'tokens'
type Period = 'today' | 'week' | 'month' | 'quarter'

const { t } = useI18n()
const { formats, cost, money, rate } = useUsageFormat()
const store = useAgentsStore()
const kind = defaultAgent

// Assez fin pour la fenêtre de 5 h, assez gros pour que 8 jours restent légers.
const PACE_STEP = 15 * MINUTE
const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30, quarter: 90 }
// Hauteurs fixes mais variées : des barres de squelette toutes égales ressemblent à un bloc.
const SKELETON_BARS = [18, 42, 8, 64, 30, 12, 52, 26, 70, 22, 36, 14, 48, 58]

const tab = ref<Tab>('limits')
const now = ref(Date.now())
const period = ref<Period>('week')
const selected = ref('weekly')
const paceBuckets = ref<UsageBucket[] | null>(null)
const samples = ref<QuotaSample[]>([])
const spendBuckets = ref<UsageBucket[] | null>(null)
const loading = ref(false)
const failed = ref(false)
const refreshing = ref(false)
let loadedAt = 0

// ===== Initialisation =====
// Les quotas bougent à chaque message : relus à chaque ouverture de la page.
if (store.status[kind].state === 'found') store.detect(kind, true)
load()
const clock = window.setInterval(() => (now.value = Date.now()), MINUTE)
window.addEventListener('focus', onFocus)
onUnmounted(() => {
  window.clearInterval(clock)
  window.removeEventListener('focus', onFocus)
})
watch(period, () => loadSpend())

const tabs = computed(() => (['limits', 'cost', 'tokens'] as const).map((value) => ({ value, label: t(`usage.tabs.${value}`) })))
const periods = computed(() => (Object.keys(PERIOD_DAYS) as Period[]).map((value) => ({ value, label: t(`usage.periods.${value}`) })))

// ===== Limites =====
const status = computed(() => store.status[kind])
const slowQuotas = useSlow(() => status.value.state === 'checking' && !status.value.usage)
const slowPace = useSlow(() => paceBuckets.value === null)

const windows = computed(() => {
  const usage = status.value.usage
  if (!usage) return []
  const list: { label: string; window: Window }[] = []
  if (usage.session) list.push({ label: t('usage.session'), window: { key: 'session', model: null, duration: 5 * HOUR, quota: usage.session } })
  if (usage.weekly) list.push({ label: t('usage.weekly'), window: { key: 'weekly', model: null, duration: 7 * DAY, quota: usage.weekly } })
  for (const { model, quota } of usage.models) {
    list.push({ label: t('usage.weeklyModel', { model }), window: { key: `weekly-${model}`, model, duration: 7 * DAY, quota } })
  }
  return list.map((entry) => ({ ...entry, pace: pace(entry.window, now.value) }))
})
// Une fenêtre sans remise à zéro (pas de session en cours) n'a rien à tracer.
const charted = computed(() => windows.value.filter((entry) => entry.pace))
const current = computed(() => charted.value.find((entry) => entry.window.key === selected.value) ?? charted.value[0])
const windowOptions = computed(() => charted.value.map((entry) => ({ value: entry.window.key, label: entry.label })))

// ===== Coût et tokens =====
const since = computed(() => {
  const start = new Date(now.value)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (PERIOD_DAYS[period.value] - 1))
  return start.getTime()
})
const hourly = computed(() => period.value === 'today')
const inPeriod = computed(() => (spendBuckets.value ?? []).filter((bucket) => bucket.at >= since.value))
const sum = computed(() => totals(inPeriod.value))
const models = computed(() => byModel(inPeriod.value))
const metric = computed(() => (tab.value === 'tokens' ? 'tokens' : 'cost'))
// Le graphique travaille dans la monnaie affichée, pour des graduations rondes en euros.
const chart = computed(() => {
  const list = columns(inPeriod.value, since.value, now.value, hourly.value, models.value.map((row) => row.model), metric.value)
  if (metric.value === 'tokens') return list
  return list.map((column) => ({ ...column, values: column.values.map((value) => value * rate.value), total: column.total * rate.value }))
})
const chartLabel = computed(() => t(`usage.chart.${metric.value}${hourly.value ? 'Hourly' : ''}`))
const slowSpend = useSlow(() => spendBuckets.value === null)
// Pendant un changement de période, l'ancien contenu reste, estompé.
const stale = useSlow(() => loading.value && spendBuckets.value !== null)

const tokens = (value: number) => formats.value.tokens.format(value)
const axisMoney = (value: number) => formats.value.costRound.format(value)
// Une part non nulle mais minuscule ne s'affiche pas « 0 % ».
const share = (value: number) => (value > 0 && value < 0.01 ? `< ${formats.value.percent.format(0.01)}` : formats.value.percent.format(value))
const rows = computed(() => {
  const list = [...models.value].sort((a, b) => (metric.value === 'tokens' ? b.tokens - a.tokens : b.cost - a.cost))
  const peak = Math.max(...list.map((row) => (metric.value === 'tokens' ? row.tokens : row.cost)), 0) || 1
  return list.map((row) => {
    const value = metric.value === 'tokens' ? row.tokens : row.cost
    const total = metric.value === 'tokens' ? sum.value.tokens : sum.value.cost
    return {
      model: row.model,
      label: row.label,
      color: row.color,
      cost: row.unpriced && !row.cost ? t('usage.unpriced') : cost(row.cost),
      share: share(total ? value / total : 0),
      tokens: tokens(row.tokens),
      bar: value / peak,
    }
  })
})

async function loadSpend() {
  const target = period.value
  loading.value = true
  try {
    const buckets = await usageHistory(since.value, HOUR)
    if (period.value === target) spendBuckets.value = buckets
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function load() {
  loadedAt = Date.now()
  now.value = loadedAt
  try {
    // Une semaine et un jour : la fenêtre hebdomadaire entière, quel que soit son jour de remise à zéro.
    const since = now.value - 8 * DAY
    const [buckets, measured] = await Promise.all([usageHistory(since, PACE_STEP), usageSamples(since)])
    paceBuckets.value = buckets
    samples.value = measured
  } catch {
    failed.value = true
  }
  await loadSpend()
}

async function refresh() {
  refreshing.value = true
  try {
    await Promise.all([store.detect(kind, true), load()])
  } finally {
    refreshing.value = false
  }
}

function onFocus() {
  if (Date.now() - loadedAt > MINUTE) load()
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="page-in flex w-full flex-col gap-6 px-8 pt-6 pb-14">
      <header class="flex items-center gap-3">
        <h2 class="min-w-0 flex-1 text-xl font-semibold">{{ t('usage.title') }}</h2>
        <UiSegmented v-model="tab" :label="t('usage.tab')" :options="tabs" />
        <UiIconButton :label="t('usage.refresh')" :loading="refreshing" @click="refresh">
          <RefreshCw class="size-4" aria-hidden="true" />
        </UiIconButton>
      </header>

      <template v-if="tab === 'limits'">
        <div v-if="windows.length" class="flex flex-col gap-3">
          <UsageQuotaCard v-for="entry in windows" :key="entry.window.key" :label="entry.label" :window="entry.window" :pace="entry.pace" />
        </div>
        <div v-else-if="slowQuotas" class="flex flex-col gap-3" role="status" :aria-label="t('usage.loading')">
          <div v-for="index in 3" :key="index" class="grid grid-cols-[13rem_minmax(0,1fr)] items-center gap-6 rounded-xl border border-stroke px-5 py-4">
            <span class="flex flex-col gap-2.5">
              <span class="skeleton h-2.5 w-24 rounded-full" />
              <span class="skeleton h-7 w-20 rounded-md" />
            </span>
            <span class="skeleton h-10 rounded-lg" />
          </div>
        </div>
        <p v-else-if="status.state !== 'checking'" class="text-sm text-muted">{{ t('usage.noLimits', { agent: agents[kind].name }) }}</p>

        <section v-if="current?.pace" class="flex flex-col gap-3 pt-4">
          <div class="flex items-center gap-3">
            <h3 class="min-w-0 flex-1 text-sm font-medium">{{ t('usage.pace.title') }}</h3>
            <UiSegmented v-if="windowOptions.length > 1" v-model="selected" :label="t('usage.pace.window')" :options="windowOptions" />
          </div>
          <div v-if="slowPace" class="skeleton h-65 rounded-lg" role="status" :aria-label="t('usage.loading')" />
          <UsagePaceChart v-else-if="paceBuckets" :window="current.window" :pace="current.pace" :buckets="paceBuckets" :samples="samples" :step="PACE_STEP" :now="now" />
        </section>
      </template>

      <template v-else>
        <UiSegmented v-model="period" class="self-start" :label="t('usage.period')" :options="periods" />
        <p v-if="failed" class="text-sm text-danger">{{ t('usage.error') }}</p>
        <template v-else>
          <section class="grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div v-if="slowSpend" class="flex flex-col gap-3" role="status" :aria-label="t('usage.loading')">
              <span class="skeleton h-9 w-36 rounded-md" />
              <span class="skeleton h-2.5 w-44 rounded-full" />
            </div>
            <div v-else class="transition-opacity" :class="{ 'opacity-40': stale }">
              <p class="flex items-center gap-1.5 text-xs text-muted">
                {{ t(`usage.total.${metric}`) }}
                <UiTooltip :label="t('usage.total.hint')">
                  <button type="button" class="grid size-4 place-items-center rounded-full hover:text-content" :aria-label="t('usage.total.hint')">
                    <Info class="size-3.5" aria-hidden="true" />
                  </button>
                </UiTooltip>
              </p>
              <p class="mt-1 text-4xl font-semibold tabular-nums">{{ metric === 'cost' ? cost(sum.cost) : tokens(sum.tokens) }}</p>
              <p class="mt-1 text-xs text-muted tabular-nums">
                {{ metric === 'cost' ? t('usage.tokensCount', { count: tokens(sum.tokens) }) : t('usage.total.costOf', { cost: cost(sum.cost) }) }}
              </p>
            </div>

            <div class="flex min-w-0 flex-col gap-3">
              <h3 class="text-sm font-medium">{{ chartLabel }}</h3>
              <div v-if="slowSpend" class="flex h-55 items-end gap-2 ps-13 pb-5.5" role="status" :aria-label="t('usage.loading')">
                <span v-for="(height, index) in SKELETON_BARS" :key="index" class="skeleton flex-1 rounded-sm" :style="{ height: `${height}%` }" />
              </div>
              <UsageSpendChart
                v-else
                class="transition-opacity"
                :class="{ 'opacity-40': stale }"
                :columns="chart"
                :models="models"
                :hourly="hourly"
                :label="chartLabel"
                :format="metric === 'cost' ? money : tokens"
                :axis="metric === 'cost' ? axisMoney : tokens"
              />
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-sm font-medium">{{ t('usage.models.title') }}</h3>
            <UiSkeleton v-if="slowSpend" :label="t('usage.loading')" :rows="4" />
            <UsageModels v-else class="transition-opacity" :class="{ 'opacity-40': stale }" :rows="rows" :share-label="t(`usage.models.share.${metric}`)" />
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
