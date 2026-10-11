import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body: string
  action?: { label: string; run: () => void }
  // Ce dont parle le message (un chat) : il disparaît quand ce sujet est vu ailleurs.
  topic?: string
  // Faux dès la fermeture : le message reste dans la liste le temps de son animation de sortie.
  open: boolean
}

const MAX = 3

// Messages en bas de la fenêtre (UiToasts, monté une fois dans App.vue).
export const useToastsStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])

  function push({ kind = 'info', ...toast }: Omit<Toast, 'id' | 'kind' | 'open'> & { kind?: ToastKind }) {
    // Les plus anciens sortent pour qu'il en reste MAX avec le nouveau.
    for (const old of toasts.value.filter((item) => item.open).slice(0, -(MAX - 1))) old.open = false
    toasts.value.push({ ...toast, kind, id: crypto.randomUUID(), open: true })
  }

  function close(match: (toast: Toast) => boolean) {
    for (const toast of toasts.value) if (match(toast)) toast.open = false
  }

  function dismiss(id: string) {
    close((toast) => toast.id === id)
  }

  function dismissTopic(topic: string) {
    close((toast) => toast.topic === topic)
  }

  // Appelé par UiToasts une fois l'animation de sortie finie.
  function remove(id: string) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return { toasts, push, dismiss, dismissTopic, remove }
})
