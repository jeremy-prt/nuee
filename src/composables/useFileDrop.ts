import { onScopeDispose, ref, type Ref } from 'vue'
import { onFileDrop } from '@/ipc/attachment'
import { useAppearanceStore } from '@/stores/appearance'

// Fichiers glissés depuis le Finder sur `target`. `over` reste vrai tant qu'ils survolent la zone.
// `anywhere` : seule cible de la page, elle prend le dépôt où qu'il tombe dans la fenêtre.
export function useFileDrop(target: Ref<HTMLElement | null>, onDrop: (paths: string[]) => void, anywhere = false) {
  const appearance = useAppearanceStore()
  const over = ref(false)
  let disposed = false
  let unlisten: (() => void) | null = null

  // Tauri donne la position en points : avec le zoom de l'interface, un px CSS en vaut plusieurs.
  function inside(px: number, py: number) {
    if (anywhere) return !!target.value
    const x = px / appearance.zoomFactor
    const y = py / appearance.zoomFactor
    const rect = target.value?.getBoundingClientRect()
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  onFileDrop((event) => {
    if (event.type === 'leave') over.value = false
    else if (event.type === 'over') over.value = inside(event.x, event.y)
    else {
      over.value = false
      if (inside(event.x, event.y) && event.paths.length) onDrop(event.paths)
    }
  }).then((stop) => {
    if (disposed) stop()
    else unlisten = stop
  })

  onScopeDispose(() => {
    disposed = true
    unlisten?.()
  })

  return { over }
}
