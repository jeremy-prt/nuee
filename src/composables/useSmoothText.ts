import { computed, onBeforeUnmount, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'

// Texte d'un agent révélé à cadence régulière, comme `smoothStream` du Vercel AI SDK : la CLI envoie parfois de gros
// morceaux (texte court, bloc sans deltas, fenêtre revenue au premier plan) qui tombaient d'un coup. Le pas grandit
// avec le retard, pour ne jamais traîner plus d'une dizaine d'images derrière le texte reçu.
const MIN_STEP = 2
const CATCH_UP = 10
// Image attendue plus longtemps : la fenêtre n'était pas à l'écran, le texte reçu entre-temps s'affiche d'un coup.
const AWAY_MS = 250

export function useSmoothText(text: MaybeRefOrGetter<string>, streaming: MaybeRefOrGetter<boolean>) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Un texte déjà complet au montage (historique, onglet rouvert) s'affiche tel quel.
  const shown = ref(toValue(streaming) && !reduced ? 0 : toValue(text).length)
  let frame = 0
  let askedAt = 0

  function schedule() {
    askedAt = performance.now()
    frame = requestAnimationFrame(tick)
  }

  function tick() {
    frame = 0
    const target = toValue(text).length
    const backlog = target - shown.value
    if (backlog <= 0 || performance.now() - askedAt > AWAY_MS) {
      shown.value = target
      return
    }
    shown.value += Math.max(MIN_STEP, Math.ceil(backlog / CATCH_UP))
    schedule()
  }

  watch(
    () => toValue(text).length,
    (length) => {
      if (reduced || length < shown.value) shown.value = length
      else if (!frame) schedule()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => cancelAnimationFrame(frame))

  const value = computed(() => {
    const full = toValue(text)
    return shown.value >= full.length ? full : full.slice(0, shown.value)
  })
  // Encore en train d'apparaître : le rendu garde son mode « en cours d'écriture » jusqu'au bout.
  const revealing = computed(() => shown.value < toValue(text).length)
  return { text: value, revealing }
}
