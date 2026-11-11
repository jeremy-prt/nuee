<script setup lang="ts">
import { ArrowDown } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatActivity from '@/components/chat/ChatActivity.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatPlan from '@/components/chat/ChatPlan.vue'
import ChatProposal from '@/components/chat/ChatProposal.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { type ChatItem, lastTurnIndex } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import { type ActivityItem, type PlanStep, planOf, PROPOSE_NEXT, type Proposal, proposalOf, START_SESSION, UPDATE_PLAN } from '@/utils/activity'
import { tasksOf } from '@/utils/tasks'
import { turnText } from '@/utils/transcript'

// `clock` : horloge du tour en cours (voir `Conversation`), pour le temps écoulé.
const props = defineProps<{
  items: readonly ChatItem[]
  running: boolean
  agent: AgentKind
  clock: { since: number; pausedMs: number; pausedAt: number | null; asking: boolean } | null
  // Titre de la session : celui de la carte « Tâche » d'une session lancée par une autre.
  title?: string | null
  // Session qui a lancé celle-ci : son premier message est sa consigne, même enregistré avant `from`.
  parentId?: string | null
  // Le champ de saisie n'est pas vide : la proposition ne met plus de réponse en avant.
  typing?: boolean
  // Session du pane qui a le focus.
  active?: boolean
}>()

const firstUser = computed(() => props.items.findIndex((item) => item.kind === 'user'))
function shownItem(item: ChatItem, index: number): ChatItem {
  if (!props.parentId || index !== firstUser.value || item.kind !== 'user' || item.from) return item
  return { ...item, from: { id: props.parentId, title: null, task: true } }
}
const fromSession = (item: ChatItem, index: number) => {
  const shown = shownItem(item, index)
  return shown.kind === 'user' && !!shown.from
}

const emit = defineEmits<{ rewind: [itemId: string]; resend: []; reply: [text: string] }>()
// Propositions fermées par la croix, le temps que la session reste affichée.
const dismissed = ref(new Set<string>())

const { t } = useI18n()
const layout = useLayoutStore()
const scroller = useTemplateRef('scroller')
const lastUser = computed(() => {
  for (let i = props.items.length - 1; i >= 0; i--) if (props.items[i]?.kind === 'user') return i
  return -1
})
const lastTurn = computed(() => lastTurnIndex(props.items))

// Une longue conversation ne monte que ses derniers messages ; les plus anciens viennent en remontant, comme dans
// une messagerie. `start` est l'indice du premier affiché, les indices du modèle restent absolus.
const PAGE = 60
// À l'ouverture, seule la fin monte : le reste de la page suit par morceaux aux images suivantes, sans retarder
// l'affichage d'une longue session.
const FIRST = 12
const limit = ref(FIRST)
const start = computed(() => Math.max(0, props.items.length - limit.value))
const shown = computed(() => props.items.slice(start.value))

// Outils et réflexions qui se suivent forment une ligne d'activité ; les questions, les sous-agents et les sessions
// lancées restent à part. Une fois le tour passé, la réflexion ne s'affiche plus (comme dans l'app Claude) et un outil
// seul reste une ligne simple. Pendant un tour, la dernière suite reste une
// ligne d'activité, même seule : c'est elle qui dit ce que fait l'agent.
// `index` : position absolue du premier élément de la ligne. `end` : fin de tour rangée avec le texte qui la précède,
// pour que le survol de la réponse et de son pied ne fasse qu'une zone.
type Row =
  | { kind: 'item'; item: ChatItem; index: number; end?: { item: ChatItem; index: number } }
  | { kind: 'activity'; id: string; items: ActivityItem[]; index: number }
  | { kind: 'plan'; id: string; steps: PlanStep[]; earlier: boolean }
  | { kind: 'proposal'; id: string; proposal: Proposal; index: number }

// Dernier plan de l'agent, comme l'app Claude : il se tient en bas du fil, au-dessus de la ligne d'activité, pendant
// son tour ; d'un tour précédent, seulement tant qu'il lui reste une étape et qu'un tour tourne. Fini et le tour
// terminé, il disparaît, comme la liste de Claude Code ; inachevé, il reste à l'endroit de sa dernière mise à jour.
const plan = computed(() => {
  for (let index = props.items.length - 1; index >= 0; index--) {
    const steps = planOf(props.items[index])
    if (steps) return { id: props.items[index]!.id, index, steps, pinned: index > lastUser.value || (props.running && steps.some((step) => step.status !== 'completed')), done: steps.every((step) => step.status === 'completed') }
  }
  return null
})
const rows = computed(() => {
  const out: Row[] = []
  let run: ActivityItem[] = []
  const close = (index: number) => {
    const first = run.find((item) => item.kind === 'tool')
    const tools = run.filter((item) => item.kind === 'tool').length
    if (tools > 1 && first) out.push({ kind: 'activity', id: first.id, items: run, index: index - run.length })
    else run.forEach((item, offset) => item.kind === 'tool' && out.push({ kind: 'item', item, index: index - run.length + offset }))
    run = []
  }
  shown.value.forEach((item, offset) => {
    // Question qui attend sa réponse : sa carte est au-dessus du champ, sa ligne ferait doublon.
    if (item.kind === 'tool' && item.tool === 'question' && !item.answers && item.status === 'running') return
    if (item.kind === 'tool' && item.name === PROPOSE_NEXT) {
      const proposal = proposalOf(item)
      if (proposal && !dismissed.value.has(item.id)) {
        close(start.value + offset)
        out.push({ kind: 'proposal', id: item.id, proposal, index: start.value + offset })
      }
      return
    }
    if (item.kind === 'tool' && item.name === UPDATE_PLAN) {
      if (plan.value && !plan.value.pinned && !plan.value.done && item.id === plan.value.id) {
        close(start.value + offset)
        out.push({ kind: 'plan', id: item.id, steps: plan.value.steps, earlier: false })
      }
      return
    }
    if ((item.kind === 'tool' && item.tool !== 'question' && item.tool !== 'agent' && item.name !== START_SESSION) || item.kind === 'thinking') run.push(item)
    else {
      const index = start.value + offset
      close(index)
      const previous = out.at(-1)
      if (item.kind === 'end' && previous?.kind === 'item' && previous.item.kind === 'text' && onlyPlansBetween(previous.index, index)) previous.end = { item, index }
      else out.push({ kind: 'item', item, index })
    }
  })
  const first = run.find((item) => item.kind === 'tool') ?? run[0]
  if (props.running && first) out.push({ kind: 'activity', id: first.id, items: run, index: props.items.length - run.length })
  else close(props.items.length)
  if (plan.value?.pinned && !(plan.value.done && !props.running)) {
    const row: Row = { kind: 'plan', id: plan.value.id, steps: plan.value.steps, earlier: plan.value.index < lastUser.value }
    const live = props.running && out.at(-1)?.kind === 'activity'
    out.splice(live ? out.length - 1 : out.length, 0, row)
  }
  // La proposition du dernier tour ferme le fil, sous le plan et la réponse : c'est la suite qu'elle propose.
  let at = out.length - 1
  while (at >= 0 && out[at]?.kind !== 'proposal') at--
  const last = out[at]
  if (last?.kind === 'proposal' && last.index > lastUser.value && at < out.length - 1) out.push(...out.splice(at, 1))
  return out
})
// Les appels au plan, sautés dans le fil, ne séparent pas un texte de sa fin de tour.
function onlyPlansBetween(from: number, to: number) {
  for (let index = from + 1; index < to; index++) {
    const item = props.items[index]
    if (item?.kind !== 'tool' || (item.name !== UPDATE_PLAN && item.name !== PROPOSE_NEXT)) return false
  }
  return true
}
const liveRun = computed(() => props.running && rows.value.at(-1)?.kind === 'activity')
// Un sous-agent en cours en bas de la conversation a déjà sa ligne animée : pas de « travaille… » en plus.
const subagentLive = computed(() => {
  for (const row of [...rows.value].reverse()) {
    if (row.kind !== 'item' || row.item.kind !== 'tool' || row.item.tool !== 'agent') return false
    if (row.item.status === 'running' || row.item.task?.status === 'running') return true
  }
  return false
})
// La ligne de compaction dit déjà que l'agent travaille.
const compacting = computed(() => {
  const last = props.items.at(-1)
  return last?.kind === 'compact' && last.status === 'running'
})
const background = computed(() => tasksOf(props.items).filter(({ task }) => task.background && task.status === 'running').length)
watch(
  () => props.items[0]?.id,
  () => (limit.value = PAGE),
)

// La hauteur ajoutée au-dessus est compensée : ce qu'on lisait ne saute pas.
async function showEarlier() {
  const el = scroller.value
  if (!el || !start.value || limit.value < PAGE) return
  const height = el.scrollHeight
  limit.value += PAGE
  await nextTick()
  el.scrollTop += el.scrollHeight - height
}

// Suit le bas tant que l'utilisateur n'est pas remonté lire plus haut ; remonté, un bouton l'y ramène.
let stick = true
const away = ref(false)

function onScroll() {
  const el = scroller.value
  if (!el) return
  const below = el.scrollHeight - el.scrollTop - el.clientHeight
  stick = below < 48
  // Pas dès le premier cran : le bouton n'apparaît qu'une fois vraiment remonté.
  away.value = below > 240
  if (el.scrollTop < 200) showEarlier()
}

function backToEnd() {
  const el = scroller.value
  if (!el) return
  stick = true
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
}

function scrollToEnd() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => props.items,
  (items) => {
    const last = items.at(-1)
    if (last?.kind === 'user' || (last?.kind === 'compact' && !last.auto)) stick = true
    if (stick) scrollToEnd()
  },
  { flush: 'post' },
)

function grow() {
  if (limit.value >= PAGE) return
  // Tout est déjà affiché : la page passe quand même à sa taille, pour les messages à venir.
  if (!start.value) {
    limit.value = PAGE
    return
  }
  requestAnimationFrame(async () => {
    const el = scroller.value
    const height = el?.scrollHeight ?? 0
    limit.value = Math.min(PAGE, limit.value + FIRST)
    await nextTick()
    if (el && stick) scrollToEnd()
    else if (el) el.scrollTop += el.scrollHeight - height
    grow()
  })
}

onMounted(() => {
  scrollToEnd()
  grow()
})
</script>

<template>
  <!-- Le bas s'estompe sous le champ de saisie au lieu d'être coupé net. -->
  <div ref="scroller" class="overflow-y-auto mask-b-from-[calc(100%-1.5rem)]" @scroll.passive="onScroll">
    <ol class="mx-auto flex max-w-(--chat-width) flex-col gap-3 px-6 py-6" data-slide-rows role="log" :aria-busy="running || limit < PAGE" :aria-label="t('chat.transcript')">
      <li v-if="start" class="flex justify-center">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
          @click="showEarlier"
        >
          {{ t('chat.earlier', { n: start }, start) }}
        </button>
      </li>
      <li
        v-for="(row, offset) in rows"
        :key="row.kind === 'item' ? row.item.id : `${row.kind}-${row.id}`"
        :data-user-row="(row.kind === 'item' && row.item.kind === 'user') || undefined"
        :class="{
          'group flex flex-col items-end gap-1': row.kind === 'item' && row.item.kind === 'user' && !fromSession(row.item, row.index),
          'group/answer flex flex-col gap-3': row.kind === 'item' && (!!row.end || row.item.kind === 'end'),
        }"
      >
        <ChatProposal
          v-if="row.kind === 'proposal'"
          :proposal="row.proposal"
          :answerable="!running && row.index > lastUser"
          :typing="typing"
          :active="active"
          @reply="emit('reply', $event)"
          @dismiss="dismissed = new Set([...dismissed, row.id])"
        />
        <ChatPlan v-else-if="row.kind === 'plan'" :steps="row.steps" :earlier="row.earlier" :live="running" :paused="clock?.pausedAt != null" />
        <ChatActivity
          v-else-if="row.kind === 'activity'"
          :items="row.items"
          :agent="agent"
          :clock="liveRun && offset === rows.length - 1 ? clock : null"
          :background="background"
        />
        <ChatMessage
          v-else
          :item="shownItem(row.item, row.index)"
          :agent="agent"
          :chat-title="title"
          :running="running"
          :streaming="running && row.index > lastUser"
          :after-text="items[row.index - 1]?.kind === 'text'"
          :answer="row.item.kind === 'end' ? () => turnText(items, row.index) : undefined"
          :rewindable="!running && row.item.kind === 'user' && !!row.item.agentId"
          :latest="!running && row.index === lastTurn"
          @rewind="emit('rewind', row.item.id)"
          @resend="emit('resend')"
        />
        <ChatMessage
          v-if="row.kind === 'item' && row.end"
          :item="row.end.item"
          :agent="agent"
          :running="running"
          :streaming="false"
          after-text
          :answer="() => turnText(items, row.end!.index)"
          :latest="!running && row.end.index === lastTurn"
          @resend="emit('resend')"
        />
      </li>
      <li v-if="running && clock && !liveRun && !compacting && !(subagentLive && clock.pausedAt === null)">
        <ChatActivity :items="[]" :agent="agent" :clock="clock" :background="background" :writing="items.at(-1)?.kind === 'text'" />
      </li>
      <li v-if="background && !running" class="flex items-center gap-2 text-sm text-muted">
        <ChatSpinner :agent="agent" muted class="text-sm" />
        <span>{{ t('chat.backgroundTasks', { n: background }, background) }}</span>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring"
          @click="layout.showView('tasks')"
        >
          {{ t('chat.showTasks') }}
        </button>
      </li>
    </ol>
    <!-- Apparaît en fondu en montant un peu, comme l'app Claude ; repart de même. -->
    <Transition
      enter-active-class="transition duration-(--motion-quick) ease-(--motion-ease) motion-reduce:transition-none"
      leave-active-class="transition duration-(--motion-quick) ease-(--motion-ease) motion-reduce:transition-none"
      enter-from-class="translate-y-2 scale-95 opacity-0"
      leave-to-class="translate-y-2 scale-95 opacity-0"
    >
      <!-- Hauteur nulle : en apparaissant, il ne rallonge pas la liste (sinon le fil rebondit en bas). -->
      <div v-if="away" class="pointer-events-none sticky bottom-6 flex h-0 items-end justify-center">
        <UiIconButton
          :label="t('chat.backToEnd')"
          class="pointer-events-auto size-9! rounded-full! border border-stroke bg-overlay! shadow-lg"
          @click="backToEnd"
        >
          <ChatSpinner v-if="running" :agent="agent" class="text-base" />
          <ArrowDown v-else class="size-4" aria-hidden="true" />
        </UiIconButton>
      </div>
    </Transition>
  </div>
</template>
