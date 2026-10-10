import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}

// Une question à la fois, affichée par UiConfirmDialog (monté une fois dans App.vue). La demande reste
// en place après la réponse : le texte ne doit pas disparaître pendant l'animation de fermeture.
export const useDialogStore = defineStore('dialog', () => {
  const open = ref(false)
  const request = shallowRef<ConfirmRequest | null>(null)
  let resolve: ((confirmed: boolean) => void) | null = null

  function answer(confirmed: boolean) {
    open.value = false
    resolve?.(confirmed)
    resolve = null
  }

  function confirm(next: ConfirmRequest) {
    answer(false)
    request.value = next
    open.value = true
    return new Promise<boolean>((done) => {
      resolve = done
    })
  }

  return { open, request, confirm, answer }
})
