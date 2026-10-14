<script setup lang="ts">
import { ArrowDown } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatActivity from '@/components/chat/ChatActivity.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { ChatItem } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import type { ActivityItem } from '@/utils/activity'
import { tasksOf } from '@/utils/tasks'
import { turnText } from '@/utils/transcript'

// `clock` : horloge du tour en cours (voir `Conversation`), pour le temps écoulé.
const props = defineProps<{
  items: readonly ChatItem[]
  running: boolean
  agent: AgentKind
  clock: { since: number; pausedMs: number; pausedAt: number | null } | null
}>()

const emit = defineEmits<{ rewind: [itemId: string] }>()

const { t } = useI18n()
const layout = useLayoutStore()
const scroller = useTemplateRef('scroller')
const lastUser = computed(() => props.items.map((item) => item.kind).lastIndexOf('user'))

// Une longue conversation ne monte que ses derniers messages ; les plus anciens viennent en remontant, comme dans
// une messagerie. `start` est l'indice du premier affiché, les indices du modèle restent absolus.
const PAGE = 60
const limit = ref(PAGE)
const start = computed(() => Math.max(0, props.items.length - limit.value))
const shown = computed(() => props.items.slice(start.value))

// Outils et réflexions qui se suivent forment une ligne d'activité. Une fois le tour passé, la réflexion ne s'affiche
// plus (comme dans l'app Claude) et un outil seul reste une ligne simple. Pendant un tour, la dernière suite reste une
// ligne d'activité, même seule : c'est elle qui dit ce que fait l'agent.
// `index` : position absolue du premier élément de la ligne.
type Row = { kind: 'item'; item: ChatItem; index: number } | { kind: 'activity'; id: string; items: ActivityItem[]; index: number }
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
    if (item.kind === 'tool' || item.kind === 'thinking') run.push(item)
    else {
      close(start.value + offset)
      out.push({ kind: 'item', item, index: start.value + offset })
    }
  })
  const first = run.find((item) => item.kind === 'tool') ?? run[0]
  if (props.running && first) out.push({ kind: 'activity', id: first.id, items: run, index: props.items.length - run.length })
  else close(props.items.length)
  return out
})
const liveRun = computed(() => props.running && rows.value.at(-1)?.kind === 'activity')
const background = computed(() => tasksOf(props.items).filter(({ task }) => task.background && task.status === 'running').length)
watch(
  () => props.items[0]?.id,
  () => (limit.value = PAGE),
)

// La hauteur ajoutée au-dessus est compensée : ce qu'on lisait ne saute pas.
async function showEarlier() {
  const el = scroller.value
  if (!el || !start.value) return
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
  stick = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  away.value = !stick
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
    if (items.at(-1)?.kind === 'user') stick = true
    if (stick) scrollToEnd()
  },
  { flush: 'post' },
)

onMounted(scrollToEnd)
</script>

<template>
  <!-- Le bas s'estompe sous le champ de saisie au lieu d'être coupé net. -->
  <div ref="scroller" class="overflow-y-auto mask-b-from-[calc(100%-1.5rem)]" @scroll.passive="onScroll">
    <ol class="mx-auto flex max-w-(--chat-width) flex-col gap-3 px-6 py-6" role="log" :aria-busy="running" :aria-label="t('chat.transcript')">
      <li v-if="start" class="flex justify-center">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
          @click="showEarlier"
        >
          {{ t('chat.earlier', { n: start }, start) }}
        </button>
      </li>
      <li v-for="(row, offset) in rows" :key="row.kind === 'item' ? row.item.id : row.id" :class="{ 'group flex flex-col items-end gap-1': row.kind === 'item' && row.item.kind === 'user' }">
        <ChatActivity
          v-if="row.kind === 'activity'"
          :items="row.items"
          :agent="agent"
          :clock="liveRun && offset === rows.length - 1 ? clock : null"
          :background="background"
        />
        <ChatMessage
          v-else
          :item="row.item"
          :agent="agent"
          :running="running"
          :streaming="running && row.index > lastUser"
          :after-text="items[row.index - 1]?.kind === 'text'"
          :answer="row.item.kind === 'end' ? () => turnText(items, row.index) : undefined"
          :rewindable="!running && row.item.kind === 'user' && !!row.item.agentId"
          @rewind="emit('rewind', row.item.id)"
        />
      </li>
      <li v-if="running && clock && !liveRun">
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
    <div v-if="away" class="pointer-events-none sticky bottom-6 flex justify-center">
      <UiIconButton
        :label="t('chat.backToEnd')"
        class="pointer-events-auto size-8! rounded-full! border border-stroke bg-popover! shadow-md"
        @click="backToEnd"
      >
        <ChatSpinner v-if="running" :agent="agent" class="text-base" />
        <ArrowDown v-else class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>
  </div>
</template>
