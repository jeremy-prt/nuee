import { defineStore } from 'pinia'
import { ref } from 'vue'

const TICK = 30_000

// Heure des durées relatives affichées (« il y a 5 min ») : un seul minuteur pour toutes les lignes.
export const useClockStore = defineStore('clock', () => {
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), TICK)
  return { now }
})
