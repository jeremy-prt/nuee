import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { chatTexts } from '@/ipc/chat'
import { fold } from '@/utils/search'

// Repli des accents par paquets : sur un gros historique (40 Mo), d'un bloc, il figeait l'interface ~400 ms.
const BATCH = 50

// Palette de recherche (SearchPalette, montée une fois dans App.vue), ouverte par ⌘K ou la barre latérale.
export const useSearchStore = defineStore('search', () => {
  const open = ref(false)
  // Texte des sessions, gardé d'une ouverture à l'autre : seules celles enregistrées depuis sont relues.
  const texts = shallowRef(new Map<string, { raw: string; folded: string }>())
  const ready = ref(false)
  let since: number | null = null
  let loading: Promise<void> | null = null

  function toggle() {
    open.value = !open.value
  }

  function refresh() {
    loading ??= (async () => {
      const started = Date.now()
      try {
        const list = await chatTexts(since)
        const next = new Map(texts.value)
        for (const [index, { id, text }] of list.entries()) {
          next.set(id, { raw: text, folded: fold(text) })
          if (index % BATCH === BATCH - 1) await new Promise((done) => setTimeout(done))
        }
        texts.value = next
        since = started
        ready.value = true
      } catch (error) {
        console.error('recherche', error)
      } finally {
        loading = null
      }
    })()
    return loading
  }

  return { open, texts, ready, toggle, refresh }
})
