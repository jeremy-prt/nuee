<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import CleanupGroupRow from '@/components/cleanup/CleanupGroupRow.vue'
import CleanupInfo from '@/components/cleanup/CleanupInfo.vue'
import CleanupRing from '@/components/cleanup/CleanupRing.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { Bot, CircleAlert, CodeFolder, Ghost, Server } from '@/components/ui/icons'
import { useSlow } from '@/composables/useSlow'
import { useTween } from '@/composables/useTween'
import type { CleanupReport } from '@/ipc/bindings/CleanupReport'
import type { CleanupScan } from '@/ipc/bindings/CleanupScan'
import { cleanupForce, cleanupRun, cleanupScan } from '@/ipc/cleanup'
import { useDialogStore } from '@/stores/dialog'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { CLEANABLE, type Cleanable, formatBytes, groupTotals, isCleanable } from '@/utils/cleanup'

type Phase = 'idle' | 'cleaning' | 'done'
type Step = 'pending' | 'working' | 'done'

const { t, locale } = useI18n()
const projects = useProjectsStore()
const dialog = useDialogStore()
const toasts = useToastsStore()

// Toutes les 2 s comme Portly : assez vif pour suivre un serveur qui démarre, ~25 ms de relevé côté Rust.
const POLL = 2000
// Cascade jouée pendant que Rust arrête les process (il ne rend qu'un résultat global) : le bouton se retire
// (LEAD), puis chaque catégorie cochée se traite à son tour. Au moins 650 ms par ligne et ~3 s en tout, sinon
// on ne voit pas le travail.
const LEAD = 300
const MIN_ROW = 650
const MIN_TOTAL = 2700

const ICONS: Record<Cleanable, typeof Ghost> = { leftovers: Ghost, others: CodeFolder, agents: Bot, servers: Server }

const scan = shallowRef<CleanupScan | null>(null)
const failed = ref(false)
const phase = ref<Phase>('idle')
const report = ref<CleanupReport | null>(null)
const forcing = ref(false)
// Orphelins, autres process de développement et agents inactifs par défaut : rien ne s'y perd. Les serveurs de
// développement servent peut-être encore.
const included = reactive<Record<Cleanable, boolean>>({ leftovers: true, others: true, agents: true, servers: false })
// Étape de chaque catégorie nettoyée ; les autres s'estompent.
const steps = reactive<Partial<Record<Cleanable, Step>>>({})
const pace = ref(MIN_ROW)
const freedReady = ref(false)
const runButton = useTemplateRef<HTMLButtonElement>('runButton')
const doneButton = useTemplateRef<{ $el: HTMLElement }>('doneButton')
let timer = 0
let disposed = false

// ===== Initialisation =====
poll()
document.addEventListener('visibilitychange', onVisibility)
onUnmounted(() => {
  disposed = true
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisibility)
})

const slow = useSlow(() => scan.value === null && !failed.value)
const processes = computed(() => (scan.value?.processes ?? []).filter((process) => isCleanable(process.group)))
const totals = computed(() => groupTotals(processes.value))
const memory = computed(() => processes.value.reduce((sum, process) => sum + process.memory, 0))
const share = computed(() => (scan.value?.totalMemory ? memory.value / scan.value.totalMemory : 0))
const machine = computed(() => (scan.value?.totalMemory ? scan.value.usedMemory / scan.value.totalMemory : 0))

const groups = computed(() => CLEANABLE.filter((group) => included[group] && totals.value[group].cleanable > 0))
const toStop = computed(() => groups.value.reduce((sum, group) => sum + totals.value[group].cleanable, 0))
// Liste du bouton « i » : ce que le nettoyage arrête dans chaque catégorie cochée, ou qu'elle est vide.
const checked = computed(() => CLEANABLE.filter((group) => included[group]))
const plan = computed(() =>
  checked.value.map((group) => {
    const total = totals.value[group]
    if (!total.cleanable) return t(`cleanup.plan.none.${group}`)
    const n = group === 'agents' ? total.idleAgents || total.cleanable : total.cleanable
    return t(`cleanup.plan.${group}`, { n, size: bytes(total.cleanableMemory) }, n)
  }),
)
// Bouton grisé : son libellé dit pourquoi.
const label = computed(() => {
  if (toStop.value || phase.value !== 'idle') return t('cleanup.clean')
  return checked.value.length ? t('cleanup.nothing') : t('cleanup.noneSelected')
})

// Le chiffre du centre : la mémoire des process de développement, qui baisse à chaque catégorie vidée, puis ce qui a été libéré.
const cleared = computed(() =>
  CLEANABLE.reduce((sum, group) => (steps[group] === 'working' || steps[group] === 'done' ? sum + totals.value[group].cleanableMemory : sum), 0),
)
const counter = useTween(() => Math.max(memory.value - cleared.value, 0), () => pace.value)
const freed = useTween(() => (phase.value === 'done' && freedReady.value ? (report.value?.freed ?? 0) : 0), 800)
const progress = computed(() => {
  const order = CLEANABLE.filter((group) => steps[group])
  if (!order.length) return 0
  return order.filter((group) => steps[group] !== 'pending').length / order.length
})

const percent = computed(() => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }))
const bytes = (value: number) => formatBytes(value, locale.value)

function rowValue(group: Cleanable) {
  const total = totals.value[group]
  return steps[group] === 'working' || steps[group] === 'done' ? total.memory - total.cleanableMemory : total.memory
}

function rowStep(group: Cleanable) {
  if (phase.value === 'idle') return undefined
  return steps[group] ?? 'dimmed'
}

async function poll() {
  clearTimeout(timer)
  if (disposed || phase.value !== 'idle') return
  if (!document.hidden) {
    try {
      scan.value = await cleanupScan(projects.projects.map((project) => project.path))
      failed.value = false
    } catch (error) {
      console.error('cleanup', error)
      failed.value = true
    }
  }
  if (!disposed && phase.value === 'idle') timer = window.setTimeout(poll, POLL)
}

function onVisibility() {
  if (!document.hidden && phase.value === 'idle') poll()
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function clean(event: MouseEvent) {
  if (!toStop.value || phase.value !== 'idle') return
  const keyboard = event.detail === 0
  clearTimeout(timer)
  const order = [...checked.value]
  for (const group of order) steps[group] = 'pending'
  pace.value = Math.max(MIN_ROW, (MIN_TOTAL - LEAD) / order.length)
  phase.value = 'cleaning'
  const paths = projects.projects.map((project) => project.path)
  const run = cleanupRun(groups.value, paths)
  // Rejet traité plus bas par `await run` : évite l'alerte de promesse rejetée pendant la cascade.
  run.catch(() => {})
  try {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await wait(LEAD)
      for (const [index, group] of order.entries()) {
        steps[group] = 'working'
        await wait(pace.value)
        if (index < order.length - 1) steps[group] = 'done'
      }
    }
    const result = await run
    for (const group of order) steps[group] = 'done'
    scan.value = await cleanupScan(paths).catch(() => scan.value)
    report.value = result
    phase.value = 'done'
    // La coche se dessine d'abord, le total libéré défile ensuite.
    setTimeout(() => (freedReady.value = true), 350)
    if (keyboard) nextTick(() => doneButton.value?.$el.focus())
  } catch (error) {
    console.error('cleanup', error)
    toasts.push({ kind: 'error', title: t('cleanup.failed'), body: String(error) })
    reset()
    poll()
  }
}

async function force() {
  const confirmed = await dialog.confirm({
    title: t('cleanup.forceConfirm.title'),
    message: t('cleanup.forceConfirm.message'),
    confirmLabel: t('cleanup.force'),
    danger: true,
  })
  if (!confirmed || !report.value) return
  forcing.value = true
  try {
    const result = await cleanupForce()
    report.value = { stopped: report.value.stopped + result.stopped, freed: report.value.freed + result.freed, remaining: result.remaining }
  } catch (error) {
    toasts.push({ kind: 'error', title: t('cleanup.failed'), body: String(error) })
  } finally {
    forcing.value = false
  }
}

function reset() {
  for (const group of CLEANABLE) delete steps[group]
  freedReady.value = false
  report.value = null
  phase.value = 'idle'
}

function finish(event: MouseEvent) {
  reset()
  poll()
  if (event.detail === 0) nextTick(() => runButton.value?.focus())
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="page-in flex min-h-full w-full flex-col px-8 pt-6 pb-14">
      <header>
        <h2 class="text-xl font-semibold">{{ t('cleanup.title') }}</h2>
        <p class="mt-1.5 text-sm text-muted">{{ t('cleanup.subtitle') }}</p>
      </header>

      <p v-if="failed && !scan" class="mt-8 text-sm text-danger">{{ t('cleanup.error') }}</p>

      <div v-else-if="slow" class="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 py-8" role="status" :aria-label="t('cleanup.loading')">
        <span class="skeleton size-44 rounded-full" />
        <span class="grid w-full grid-cols-5 gap-8">
          <span v-for="index in 5" :key="index" class="skeleton h-24 rounded-xl" />
        </span>
      </div>

      <div v-else-if="scan" class="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-8">
        <section class="@container">
          <div class="flex flex-col items-center gap-10 @3xl:flex-row @3xl:gap-16">
            <div class="flex shrink-0 flex-col items-center gap-6">
              <CleanupRing :share="share" :machine="machine" :progress="progress" :pace="pace" :phase="phase">
                <template v-if="phase === 'done'">
                  <svg class="check mb-1 size-10 text-success" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span class="rise text-4xl font-semibold tracking-tight tabular-nums">{{ bytes(freed) }}</span>
                  <span class="rise rise-late mt-1 text-xs text-muted">{{ t('cleanup.freedLabel') }}</span>
                </template>
                <template v-else>
                  <span class="text-4xl font-semibold tracking-tight tabular-nums">{{ bytes(counter) }}</span>
                  <Transition name="label" mode="out-in">
                    <span :key="phase" class="mt-1 text-xs text-muted">{{ phase === 'cleaning' ? t('cleanup.cleaning') : t('cleanup.hero') }}</span>
                  </Transition>
                </template>
              </CleanupRing>

              <div class="flex gap-8 whitespace-nowrap">
                <dl class="flex gap-2.5">
                  <span class="mt-1 size-2 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  <div>
                    <dt class="text-xs text-muted">{{ t('cleanup.legend.tracked') }}</dt>
                    <dd class="mt-0.5 text-sm font-medium tabular-nums">{{ t('cleanup.legend.trackedValue', { percent: percent.format(share) }) }}</dd>
                  </div>
                </dl>
                <dl class="flex gap-2.5">
                  <span class="mt-1 size-2 shrink-0 rounded-full bg-content/25" aria-hidden="true" />
                  <div>
                    <dt class="text-xs text-muted">{{ t('cleanup.legend.machine') }}</dt>
                    <dd class="mt-0.5 text-sm font-medium tabular-nums">{{ t('cleanup.machineValue', { used: bytes(scan.usedMemory), total: bytes(scan.totalMemory) }) }}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <ul class="w-full min-w-0 flex-1 divide-y divide-stroke">
              <CleanupGroupRow
                v-for="group in CLEANABLE"
                :key="group"
                v-model:included="included[group]"
                :icon="ICONS[group]"
                :title="t(`cleanup.groups.${group}.title`)"
                :help="t(`cleanup.groups.${group}.help`)"
                :value="rowValue(group)"
                :step="rowStep(group)"
                :pace="pace"
              />
            </ul>
          </div>
        </section>

        <div class="mt-10 grid h-40 place-items-center" aria-live="polite">
          <p v-if="phase === 'cleaning'" class="sr-only">{{ t('cleanup.cleaning') }}</p>
          <div v-if="phase === 'done' && report" class="result flex flex-col items-center gap-3">
            <p class="sr-only">{{ t('cleanup.freed', { size: bytes(report.freed) }) }}</p>
            <p class="text-sm text-muted">{{ t('cleanup.stopped', report.stopped) }}</p>
            <p v-if="report.remaining" class="flex items-center gap-1.5 text-xs text-warning">
              <CircleAlert class="size-3.5" aria-hidden="true" />
              {{ t('cleanup.remaining', report.remaining) }}
            </p>
            <div class="flex gap-2">
              <UiButton v-if="report.remaining" variant="danger" :loading="forcing" @click="force">{{ t('cleanup.force') }}</UiButton>
              <UiButton ref="doneButton" @click="finish">{{ t('cleanup.done') }}</UiButton>
            </div>
          </div>
          <div v-else class="group relative">
            <span class="orb relative grid size-40 place-items-center" :data-phase="phase" :data-off="!toStop && phase === 'idle' ? '' : undefined">
              <span class="halo pointer-events-none absolute rounded-full" aria-hidden="true" />
              <span class="rim pointer-events-none absolute inset-5 rounded-full" aria-hidden="true" />
              <button
                ref="runButton"
                type="button"
                class="run relative grid size-28 place-items-center rounded-full text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-ring disabled:cursor-not-allowed"
                :disabled="!toStop || phase !== 'idle'"
                :aria-busy="phase === 'cleaning' || undefined"
                @click="clean"
              >
                <span class="px-3 leading-tight" :class="{ 'text-[13px]': !toStop && phase === 'idle' }">{{ label }}</span>
              </button>
            </span>
            <!-- Dans le rond, au survol ou au focus : le bouton reste seul au repos. -->
            <span
              v-if="phase === 'idle'"
              class="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-(--hover-duration) group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100"
              :class="toStop ? 'text-on-signal' : 'text-muted'"
            >
              <CleanupInfo :items="plan" :empty="t('cleanup.plan.pick')" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fin du nettoyage : la coche se dessine, puis le total libéré et son libellé arrivent, puis le bilan. */
.check path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 400ms var(--motion-ease) forwards;
}

.rise {
  animation: rise 300ms var(--motion-ease) 250ms backwards;
}

.rise-late {
  animation-delay: 550ms;
}

.result {
  animation: rise 300ms var(--motion-ease) 700ms backwards;
}

.label-enter-active,
.label-leave-active {
  transition: opacity 150ms linear;
}

.label-enter-from,
.label-leave-to {
  opacity: 0;
}

/* Bouton rond à la CleanMyMac : sphère éclairée par le haut, rebond de lumière en bas, halo qui respire et liseré qui tourne. */
.run {
  color: var(--color-on-signal);
  background:
    radial-gradient(70% 55% at 50% 8%, color-mix(in oklab, white 38%, transparent), transparent 70%),
    radial-gradient(90% 60% at 50% 100%, color-mix(in oklab, var(--color-signal) 70%, white) 0%, transparent 60%),
    linear-gradient(to bottom, color-mix(in oklab, var(--color-signal) 80%, white), var(--color-signal) 45%, color-mix(in oklab, var(--color-signal) 75%, black));
  box-shadow:
    inset 0 0 0 1px color-mix(in oklab, white 16%, transparent),
    inset 0 1px 1px color-mix(in oklab, white 45%, transparent),
    inset 0 -12px 24px color-mix(in oklab, black 14%, transparent),
    0 16px 36px -10px color-mix(in oklab, var(--color-signal) 75%, transparent),
    0 4px 10px -4px color-mix(in oklab, black 40%, transparent);
  text-shadow: 0 1px 2px color-mix(in oklab, black 22%, transparent);
  transition:
    scale 200ms var(--motion-ease),
    filter 200ms var(--motion-ease);
}

.run:enabled:hover {
  filter: brightness(1.05);
}

.run:enabled:active {
  scale: 0.97;
  filter: brightness(0.96);
}

.run:disabled:not([aria-busy]) {
  color: var(--color-muted);
  background: color-mix(in oklab, var(--color-content) 6%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, var(--color-content) 8%, transparent),
    inset 0 0 0 1px var(--color-stroke);
  text-shadow: none;
}

.halo {
  background: radial-gradient(circle, color-mix(in oklab, var(--color-signal) 70%, transparent) 40%, transparent 70%);
  filter: blur(18px);
  scale: 1.3;
  opacity: 0.45;
  animation: breathe 3.2s ease-in-out infinite;
  inset: 1rem;
  transition:
    opacity 300ms var(--motion-ease),
    inset 300ms var(--motion-ease);
}

/* Couronne d'un pixel et demi, à peine teintée, où file une traînée lumineuse. */
.rim {
  background:
    conic-gradient(from 0deg, transparent 0turn, color-mix(in oklab, var(--color-signal) 40%, white) 0.2turn, transparent 0.24turn),
    color-mix(in oklab, var(--color-signal) 22%, transparent);
  mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
  opacity: 0.8;
  animation: spin 7s linear infinite;
  transition: opacity 300ms var(--motion-ease);
}

/* L'animation tient `scale` : le survol agrandit le halo par `inset`. */
.orb:has(.run:enabled:hover) .halo {
  inset: 0.5rem;
  opacity: 0.75;
}

/* Au clic, le bouton se contracte et s'efface : l'anneau du haut et les catégories prennent le relais. */
.orb {
  animation: orb-in 300ms var(--motion-ease);
  transition:
    opacity 300ms var(--motion-ease),
    scale 300ms var(--motion-ease);
}

.orb[data-phase='cleaning'] {
  opacity: 0;
  scale: 0.8;
}

.orb[data-off] :is(.halo, .rim) {
  opacity: 0;
  animation: none;
}

@keyframes breathe {
  50% {
    opacity: 0.3;
    scale: 1.42;
  }
}

@keyframes spin {
  to {
    rotate: 1turn;
  }
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    translate: 0 6px;
  }
}

@keyframes orb-in {
  from {
    opacity: 0;
    scale: 0.92;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

/* Mouvement réduit : ni transformation ni tracé, des fondus d'opacité courts. */
@media (prefers-reduced-motion: reduce) {
  .halo,
  .rim {
    animation: none;
  }
  .run,
  .halo {
    transition: none;
  }
  .orb {
    animation: fade-in 150ms linear;
    transition: opacity 150ms linear;
  }
  .orb[data-phase='cleaning'] {
    scale: none;
  }
  .check path {
    animation: none;
    stroke-dashoffset: 0;
  }
  .check,
  .rise,
  .result {
    animation: fade-in 150ms linear;
  }
}
</style>
