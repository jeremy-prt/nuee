<script lang="ts">
import { ref } from 'vue'

// Retenu hors du composant : la barre de titre en monte un dans la vue des sessions, un autre ailleurs.
const kept = ref<string | null>(null)
</script>

<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellTab from '@/components/shell/ShellTab.vue'
import { type SessionStatus, useSessionStatus } from '@/composables/useSessionStatus'
import { useAttentionStore } from '@/stores/attention'
import { useWorkspaceStore } from '@/stores/workspace'

// Onglets épinglés, d'après `pinned_tabs.rs` de monocode : jusqu'à trois côte à côte ; au-delà, une pile de cartes
// qui s'étale en rangée au survol, au focus clavier, ⌘ tenu ou menu d'une carte ouvert, et pousse les onglets voisins.
const props = defineProps<{ numbered?: boolean; rank?: (index: number) => number | null }>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const attention = useAttentionStore()
const sessionStatus = useSessionStatus()

// Valeurs reprises de `tab_tile.rs` (monocode).
const CARD_W = 24
const CARD_H = 20
const INSET = 4
const PEEK = 4
const SHRINK = 2
const GAP = 6
const STACK_MAX = 3
const ROW_MAX = 3

const tabs = computed(() => workspace.pinnedTabs)
const stacks = computed(() => tabs.value.length > ROW_MAX)

const hovered = ref(false)
const keyboard = ref(false)
const menu = ref<string | null>(null)
const open = computed(() => !stacks.value || hovered.value || keyboard.value || !!menu.value || !!props.numbered)

watch(
  () => workspace.activeTabId,
  (id) => {
    if (id && workspace.isTabPinned(id)) kept.value = id
  },
  { immediate: true },
)
const front = computed(() => {
  const ids = tabs.value.map((tab) => tab.id)
  const shown = ids.indexOf(workspace.activeTabId ?? '')
  if (shown !== -1) return shown
  const last = ids.indexOf(kept.value ?? '')
  return last === -1 ? 0 : last
})

function depth(index: number) {
  if (index === front.value) return 0
  return index < front.value ? index + 1 : index
}

function card(index: number) {
  if (open.value) return { transform: `translate(${index * (CARD_W + GAP)}px, 0)`, opacity: 1, zIndex: STACK_MAX + 1 - depth(index) }
  const d = depth(index)
  const rest = Math.min(d, STACK_MAX - 1)
  const scale = `scale(${(CARD_W - rest * SHRINK) / CARD_W}, ${(CARD_H - rest * SHRINK) / CARD_H})`
  return {
    transform: `translate(${rest * (PEEK + SHRINK)}px, ${(rest * SHRINK) / 2}px) ${scale}`,
    opacity: d < STACK_MAX ? 1 : 0,
    zIndex: STACK_MAX + 1 - rest,
    // Sous la pile, seul le bord de la carte dépasse : son icône déborderait de quelques pixels.
    '--pin-ink': d === 0 ? 1 : 0,
  }
}

const width = computed(() => {
  const count = tabs.value.length
  const inner = open.value ? count * CARD_W + (count - 1) * GAP : CARD_W + (Math.min(count, STACK_MAX) - 1) * PEEK
  return inner + INSET * 2
})

// Un épinglé caché sous la pile garde son état visible : la pastille prend le plus pressant.
const urgency: (SessionStatus | 'unseen')[] = ['approval', 'question', 'failed', 'done', 'working', 'unseen']
// Au travail : un anneau qui pulse, pour ne pas le confondre avec le point plein du non-lu (même teinte).
const dotStyle = {
  approval: 'bg-warning',
  question: 'bg-warning',
  failed: 'bg-danger',
  done: 'bg-success',
  working: 'border-2 border-signal-text bg-canvas motion-safe:animate-pulse',
  unseen: 'bg-signal',
}
const pending = computed(() => {
  if (open.value) return null
  let best: SessionStatus | 'unseen' | null = null
  tabs.value.forEach((tab, index) => {
    if (index === front.value) return
    const state = sessionStatus(tab.id) ?? (attention.isUnseen(tab.id) ? 'unseen' : null)
    if (state && (!best || urgency.indexOf(state) < urgency.indexOf(best))) best = state
  })
  return best as SessionStatus | 'unseen' | null
})

// Clavier : une seule carte dans l'ordre de tabulation, les flèches passent aux autres.
const deck = useTemplateRef<HTMLElement>('deck')
const cursor = ref<number | null>(null)
const focusable = computed(() => cursor.value ?? front.value)

function cards() {
  return [...(deck.value?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])]
}

function onKeydown(event: KeyboardEvent) {
  const count = tabs.value.length
  const from = cards().indexOf(event.target as HTMLElement)
  if (from === -1) return
  const to = { ArrowRight: from + 1, ArrowLeft: from - 1, Home: 0, End: count - 1 }[event.key]
  if (to === undefined) return
  event.preventDefault()
  cursor.value = Math.max(0, Math.min(count - 1, to))
  cards()[cursor.value]?.focus()
}

// Un clic donne aussi le focus à la carte : seul le focus visible (clavier) garde la pile étalée.
function onFocusin(event: FocusEvent) {
  const target = event.target as HTMLElement
  if (!target.matches(':focus-visible')) return
  keyboard.value = true
  const index = cards().indexOf(target)
  if (index !== -1) cursor.value = index
}

function onFocusout(event: FocusEvent) {
  if (deck.value?.contains(event.relatedTarget as Node | null)) return
  keyboard.value = false
  cursor.value = null
}

function onMenu(id: string, state: boolean) {
  if (state) menu.value = id
  else if (menu.value === id) menu.value = null
}
</script>

<template>
  <div
    v-if="tabs.length"
    ref="deck"
    role="tablist"
    :aria-label="[t('workspace.pinnedDeck', { n: tabs.length }, tabs.length), pending && t(`workspace.pinnedState.${pending}`)].filter(Boolean).join(', ')"
    class="pin-deck relative h-7 shrink-0 rounded-lg"
    :class="[workspace.activeTabId && workspace.isTabPinned(workspace.activeTabId) ? 'bg-selection' : 'bg-selection-hover', { 'is-open': open }]"
    :style="{ width: `${width}px` }"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
    @focusin="onFocusin"
    @focusout="onFocusout"
    @keydown="onKeydown"
  >
    <ShellTab
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="pin-card-slot absolute start-1 top-1"
      :style="card(index)"
      :tab="tab"
      :index="-1"
      :count="0"
      :rank="numbered && rank ? rank(index) : null"
      :focusable="index === focusable"
      @menu="onMenu(tab.id, $event)"
    />
    <span v-if="pending" class="absolute -end-0.5 -top-0.5 z-10 size-2 rounded-full ring-2 ring-canvas" :class="dotStyle[pending]" aria-hidden="true" />
  </div>
</template>
