<script setup lang="ts">
import { SquareTerminal, X } from '@/components/ui/icons'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useDockFocus } from '@/composables/useDockFocus'
import { useAppearanceStore } from '@/stores/appearance'
import type { CodeRun } from '@/stores/codeRuns'
import { useLayoutStore } from '@/stores/layout'
import { ANSI } from '@/stores/terminals'
import { parseAnsi } from '@/utils/ansi'

// Sortie d'une commande lancée depuis un bloc de code, sous lui. Texte stylé en nœuds Vue, jamais en HTML ; seul
// l'état est annoncé aux lecteurs d'écran, pas chaque ligne.
const props = defineProps<{ run: CodeRun }>()
// keyboard : la croix validée au clavier disparaît avec le bloc, le parent reprend le focus.
const emit = defineEmits<{ dismiss: [keyboard: boolean] }>()

const { t } = useI18n()
const layout = useLayoutStore()
const appearance = useAppearanceStore()
const { focusView } = useDockFocus()
const scroller = useTemplateRef('scroller')
// Le bloc naît sous le champ de saisie quand son code est en bas du fil : on l'amène en vue, marge comprise.
const root = useTemplateRef('root')
onMounted(() => root.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))

const spans = computed(() => parseAnsi(props.run.text, ANSI[appearance.resolvedMode]))
const empty = computed(() => !spans.value.some((span) => span.text.trim()))
const status = computed(() => {
  const { status, code } = props.run
  if (status === 'running' || status === 'stopping') return t('chat.run.running')
  if (status === 'failed') return t('chat.run.failed', { code: code ?? '' })
  if (status === 'error') return t('chat.run.error')
  if (status === 'stopped') return t('chat.run.stopped')
  return t('chat.run.done')
})
const failed = computed(() => props.run.status === 'failed' || props.run.status === 'error')

// Accrochée en bas tant qu'on n'est pas remonté lire plus haut.
let pinned = true
watch(
  () => props.run.text,
  async () => {
    const element = scroller.value
    pinned = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 8
    await nextTick()
    if (pinned && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
  { flush: 'pre' },
)

function openTerminal() {
  layout.showView('terminal')
  focusView('terminal')
}
</script>

<template>
  <div ref="root" class="relative mt-1 scroll-mb-40 rounded-md border border-stroke" dir="ltr">
    <pre
      v-if="!empty"
      ref="scroller"
      tabindex="0"
      :aria-label="t('chat.run.output')"
      class="code-veil max-h-64 overflow-auto p-3 pb-1 font-mono text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-ring [--veil:0]"
      style="--veil-width: 66px"
    ><span
      v-for="(span, index) in spans"
      :key="index"
      :class="{ 'font-semibold': span.bold, 'opacity-60': span.dim, italic: span.italic, underline: span.underline }"
      :style="span.color ? { color: span.color } : undefined"
    >{{ span.text }}</span></pre>
    <p
      role="status"
      aria-live="polite"
      class="flex items-center gap-1.5 px-3 text-xs"
      :class="[failed ? 'text-danger' : 'text-muted', empty ? 'min-h-11' : 'pb-2', { 'sr-only': run.status === 'done' && !empty }]"
    >
      <span v-if="run.status === 'running' || run.status === 'stopping'" class="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
      {{ status }}
    </p>
    <div class="absolute end-2 top-2 flex gap-0.5">
      <UiIconButton inner :label="t('chat.run.terminal')" @click="openTerminal">
        <SquareTerminal class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton inner :label="t('chat.run.dismiss')" @click="emit('dismiss', $event.detail === 0)">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
  </div>
</template>
