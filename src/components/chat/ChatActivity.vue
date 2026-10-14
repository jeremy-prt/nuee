<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ChatThinking from '@/components/chat/ChatThinking.vue'
import ChatThumb from '@/components/chat/ChatThumb.vue'
import ChatTool from '@/components/chat/ChatTool.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { type ActivityItem, capitalize, fileName, fileVerb, summarize } from '@/utils/activity'
import { agents } from '@/utils/agents'
import { formatDuration } from '@/utils/duration'

// Suite d'outils entre deux textes de l'agent, repliée en une ligne. Avec `clock` (tour en cours, horloge de
// performance.now), c'est la seule ligne qui dit que l'agent travaille, comme dans l'app Claude. `writing` : l'agent
// écrit sa réponse ; sans étape ni texte, il réfléchit.
const props = defineProps<{
  items: readonly ActivityItem[]
  agent: AgentKind
  clock?: { since: number; pausedMs: number; pausedAt: number | null } | null
  background?: number
  writing?: boolean
}>()

const { t, locale } = useI18n()
const open = ref(false)
const live = computed(() => !!props.clock)

// « Exécuté 4 commandes (1 échec), créé, lu et modifié notes.txt » : le nom de fichier ressort.
const summary = computed(() => {
  const { parts, added, removed, failedFiles } = summarize(props.items)
  const list = new Intl.ListFormat(locale.value, { type: 'conjunction' })
  const segments = parts.map((part) => {
    if (part.kind === 'count') {
      const failed = part.failed ? ` ${t('chat.activity.failed', { n: part.failed }, part.failed)}` : ''
      return { text: t(`chat.activity.count.${part.tool}`, { n: part.n }, part.n) + failed, name: null }
    }
    const verbs = list.format(part.verbs.map((verb) => t(`chat.activity.verbs.${verb}`)))
    return part.name ? { text: `${verbs} `, name: part.name } : { text: `${verbs} ${t('chat.activity.files', { n: part.n }, part.n)}`, name: null }
  })
  const [first] = segments
  if (first) first.text = capitalize(first.text, locale.value)
  const failed = failedFiles ? t('chat.activity.failed', { n: failedFiles }, failedFiles) : null
  return { segments, added, removed, failed }
})

// Dernière image lue dans la suite : sa vignette se voit sans déplier.
const imageTool = computed(() => {
  for (const item of [...props.items].reverse()) if (item.kind === 'tool' && item.image) return item
  return null
})

// Dernière étape outillée : son nom reste affiché jusqu'à la suivante, sans repasser par un texte générique.
const step = computed(() => {
  for (const item of [...props.items].reverse()) {
    if (item.kind !== 'tool') continue
    const verb = item.summary ? fileVerb(item) : null
    if (verb) return { text: t(`chat.activity.doing.${verb === 'created' ? 'create' : item.tool}`), name: fileName(item.summary ?? '') }
    const text = item.tool === 'agent' ? t('chat.activity.doing.agent') : item.detail?.description
    return { text: text ?? t(`chat.activity.doing.${item.tool}`), name: null }
  }
  return null
})
// Ce que dit la ligne vivante : l'attente d'une autorisation, la réflexion en cours, la dernière étape outillée (gardée
// jusqu'à la suivante), sinon que l'agent travaille.
const label = computed(() => {
  if (props.clock?.pausedAt != null) return { text: t('chat.waitingApproval'), name: null, shimmer: false }
  if (props.items.at(-1)?.kind === 'thinking') return { text: t('chat.activity.thinking'), name: null, shimmer: true }
  if (step.value && !props.writing) return { ...step.value, shimmer: true }
  return { text: t('chat.working', { agent: agents[props.agent].name }), name: null, shimmer: true }
})

// Une seule horloge à l'écran : celle de la ligne vivante.
const now = ref(performance.now())
let timer = 0
watch(
  live,
  (on) => {
    clearInterval(timer)
    if (on) timer = window.setInterval(() => (now.value = performance.now()), 1000)
  },
  { immediate: true },
)
onScopeDispose(() => clearInterval(timer))
const elapsed = computed(() => {
  const clock = props.clock
  if (!clock) return ''
  return formatDuration((clock.pausedAt ?? now.value) - clock.since - clock.pausedMs, locale.value)
})

// La réflexion ne reste dans la liste que pendant le tour.
const entries = computed(() => props.items.filter((item) => item.kind === 'tool' || live.value))
</script>

<template>
  <!-- Débord de la marge du bouton : le texte s'aligne sur celui de l'agent, le survol dépasse autour. -->
  <div class="-mx-2 text-sm">
    <div class="flex items-center gap-2">
      <component
        :is="items.length ? 'button' : 'div'"
        :type="items.length ? 'button' : undefined"
        class="flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-start text-muted"
        :class="{ 'hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring': items.length }"
        :aria-expanded="items.length ? open : undefined"
        @click="items.length && (open = !open)"
      >
        <template v-if="live">
          <ChatSpinner :agent="agent" class="me-0.5 text-base" />
          <span class="shrink-0" :class="{ 'text-shimmer': label.shimmer }">{{ label.text }}</span>
          <span v-if="label.name" class="min-w-0 truncate text-content">{{ label.name }}</span>
          <span class="shrink-0 text-xs tabular-nums">{{ elapsed }}</span>
          <span v-if="background" class="min-w-0 truncate text-xs">· {{ t('chat.backgroundTasks', { n: background }, background) }}</span>
        </template>
        <span v-else class="min-w-0 truncate">
          <template v-for="(segment, index) in summary.segments" :key="index">
            {{ index ? ', ' : '' }}{{ segment.text }}<span v-if="segment.name" class="text-content">{{ segment.name }}</span>
          </template>
          <template v-if="summary.failed"> {{ summary.failed }}</template>
        </span>
        <ChatDiffStat v-if="!live && (summary.added || summary.removed)" :added="summary.added" :removed="summary.removed" />
        <ChevronRight
          v-if="items.length"
          class="size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
          :class="{ 'rotate-90': open }"
          aria-hidden="true"
        />
      </component>
      <ChatThumb
        v-if="imageTool?.image && !open"
        :path="imageTool.image"
        :alt="imageTool.summary ?? imageTool.name"
        :caption="imageTool.name"
        class="ms-auto me-1"
      />
    </div>
    <ul v-if="open && entries.length" class="mt-1 mb-2 ms-2 divide-y divide-stroke rounded-lg border border-stroke">
      <li v-for="item in entries" :key="item.id" class="p-0.5">
        <ChatTool v-if="item.kind === 'tool'" :item="item" />
        <ChatThinking v-else :text="item.text" :duration-ms="item.durationMs" :live="live && item.durationMs === null" />
      </li>
    </ul>
  </div>
</template>
