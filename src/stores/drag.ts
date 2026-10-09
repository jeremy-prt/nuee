import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DockPosition, DockView } from '@/stores/layout'

export type DragSource = { kind: 'tab'; id: string } | { kind: 'view'; view: DockView }

export type DropTarget =
  | { kind: 'dock'; position: DockPosition }
  | { kind: 'pane'; index: number; side: 'left' | 'right' | 'center' }

export interface PreviewRect {
  left: number
  top: number
  width: number
  height: number
}

export const useDragStore = defineStore('drag', () => {
  const source = ref<DragSource | null>(null)
  const target = ref<DropTarget | null>(null)
  const preview = ref<PreviewRect | null>(null)

  function reset() {
    source.value = null
    target.value = null
    preview.value = null
  }

  return { source, target, preview, reset }
})
