import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFilesStore } from '@/stores/files'
import { type EditorView, SIZES, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'

// Largeur d'un panneau avec éditeur ouvert tant qu'elle n'a pas été réglée : de quoi lire du code à côté de la liste,
// sans réduire la conversation sous `CONVERSATION_MIN`.
const EDITOR_COMFORT = 520
const CONVERSATION_MIN = 420

// Éditeur à gauche de la liste d'un volet, comme monocode (Explorateur, volet Git) : la liste garde la largeur
// `files.explorerWidth`, commune aux deux, et le panneau celle retenue pour l'édition tant que `track` le dit.
// `room` : la plus grande largeur que le panneau peut prendre sans réduire la conversation sous son minimum.
export function useDockEditor(view: EditorView) {
  const files = useFilesStore()
  const layout = useLayoutStore()
  const navigation = useNavigationStore()

  // Zone du volet : tout le panneau, ou sa part quand il est partagé en deux.
  const area = ref<HTMLElement | null>(null)
  const areaWidth = ref<number | null>(null)
  const resize = new ResizeObserver(([entry]) => (areaWidth.value = entry ? Math.round(entry.contentRect.width) : null))
  watch(area, (element, before) => {
    if (before) resize.unobserve(before)
    if (element) resize.observe(element)
  })

  const listWidth = computed({
    get: () => files.explorerShown(areaWidth.value ?? layout.right.size),
    set: (width: number) => files.setExplorerWidth(width),
  })

  // Suivie sur la colonne centrale : fenêtre, barre latérale et panneau la font changer.
  const room = ref<number>(SIZES.right.max)
  const center = () => document.querySelector<HTMLElement>('main.center-card:not(#view-area)')
  function measure() {
    const element = center()
    room.value = element ? Math.min(SIZES.right.max, element.clientWidth + layout.right.size - CONVERSATION_MIN) : SIZES.right.max
  }
  const centerResize = new ResizeObserver(measure)
  onMounted(() => {
    const element = center()
    if (element) centerResize.observe(element)
    measure()
  })

  function roomy() {
    measure()
    return Math.min(EDITOR_COMFORT + files.explorerWidth + 1, room.value)
  }

  // Vue des sessions gardée montée sous Réglages : l'aperçu d'un skill y reprend la largeur du panneau simple.
  function track(shown: () => boolean) {
    watch(
      () => shown() && navigation.view === 'chats',
      (editing) => layout.setEditing(view, editing, editing ? roomy() : 0),
      { immediate: true },
    )
  }
  onBeforeUnmount(() => {
    resize.disconnect()
    centerResize.disconnect()
    layout.setEditing(view, false)
  })

  return { area, listWidth, room, track }
}
