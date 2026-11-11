import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { DockView, DockZone } from '@/stores/layout'

export type DragSource =
  | { kind: 'tab'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'chat'; id: string }
  // Onglet du panneau de droite : `id` est sa clé dans la barre (page, groupe de shells ou volet).
  | { kind: 'dock'; id: string; view: DockView }

export type DropTarget =
  | { kind: 'pane'; index: number; side: 'left' | 'right' | 'center' }
  | { kind: 'project'; group: string | null; pinned: boolean; before: string | null }
  | { kind: 'chat'; pinned: boolean; before: string | null }
  | { kind: 'dock'; at: DockZone }

export interface PreviewRect {
  left: number
  top: number
  width: number
  height: number
  // Trait d'insertion entre deux lignes (réordonner), plutôt qu'un cadre (déposer dans une zone).
  line?: boolean
}

export const useDragStore = defineStore('drag', () => {
  const source = ref<DragSource | null>(null)
  const target = ref<DropTarget | null>(null)
  const preview = ref<PreviewRect | null>(null)
  // Session glissée : son titre suit le pointeur (App.vue).
  const ghost = ref<{ x: number; y: number; label: string } | null>(null)

  function reset() {
    source.value = null
    target.value = null
    preview.value = null
    ghost.value = null
  }

  return { source, target, preview, ghost, reset }
})
