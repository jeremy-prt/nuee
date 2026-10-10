import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: string
  title: string
  body: string
  action?: { label: string; run: () => void }
  // Ce dont parle le message (un chat) : il disparaît quand ce sujet est vu ailleurs.
  topic?: string
}

const MAX = 3

// Messages en bas de la fenêtre (UiToasts, monté une fois dans App.vue).
export const useToastsStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])

  function push(toast: Omit<Toast, 'id'>) {
    toasts.value = [...toasts.value, { ...toast, id: crypto.randomUUID() }].slice(-MAX)
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function dismissTopic(topic: string) {
    toasts.value = toasts.value.filter((toast) => toast.topic !== topic)
  }

  return { toasts, push, dismiss, dismissTopic }
})
