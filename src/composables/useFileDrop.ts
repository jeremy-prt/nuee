import { onScopeDispose, ref, type Ref } from 'vue'
import { onFileDrop } from '@/ipc/attachment'

// Fichiers glissés depuis le Finder sur `target`. `over` reste vrai tant qu'ils survolent la zone.
export function useFileDrop(target: Ref<HTMLElement | null>, onDrop: (paths: string[]) => void) {
  const over = ref(false)
  let disposed = false
  let unlisten: (() => void) | null = null

  function inside(x: number, y: number) {
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
