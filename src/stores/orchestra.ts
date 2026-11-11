import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import type { ChatItem } from '@/stores/conversations'

const STORAGE_KEY = 'nuee.orchestra.v1'

function load(): Record<string, true> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Object.fromEntries((Array.isArray(saved) ? saved : []).filter((id) => typeof id === 'string').map((id) => [id, true]))
  } catch {
    return {}
  }
}

// Mode Orchestre du champ de saisie, par session. Gardé ici et non dans le champ, recréé à chaque onglet.
// Sans choix fait dans cette fenêtre, la session reprend le mode de son dernier message envoyé.
// `known` garde au redémarrage le dernier mode connu : la barre latérale le montre sans charger les messages.
export const useOrchestraStore = defineStore('orchestra', () => {
  const chosen = reactive(new Map<string, boolean>())
  const known = reactive(load())
  watch(known, () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.keys(known)))
    } catch {
      // Stockage plein ou refusé : le mode reste connu jusqu'à la fermeture.
    }
  })

  function note(chatId: string, on: boolean) {
    if (on) known[chatId] = true
    else delete known[chatId]
  }

  function isOn(chatId: string) {
    return chosen.get(chatId) ?? known[chatId] ?? false
  }

  function set(chatId: string, on: boolean) {
    chosen.set(chatId, on)
    note(chatId, on)
  }

  function remember(chatId: string, items: readonly ChatItem[]) {
    if (chosen.has(chatId)) return
    const last = [...items].reverse().find((item) => item.kind === 'user' && !item.from)
    note(chatId, last?.kind === 'user' && !!last.orchestra)
  }

  return { isOn, set, remember }
})
