import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import type { Attachment } from '@/ipc/bindings/Attachment'

export interface Draft {
  text: string
  attachments: Attachment[]
}

const STORAGE_KEY = 'nuee.drafts.v1'

function load(): Record<string, Draft> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const drafts: Record<string, Draft> = {}
    for (const [id, draft] of Object.entries(saved ?? {})) {
      const { text, attachments } = (draft ?? {}) as Partial<Draft>
      if (typeof text === 'string') drafts[id] = { text, attachments: Array.isArray(attachments) ? attachments : [] }
    }
    return drafts
  } catch {
    return {}
  }
}

// Message commencé dans chaque session : le champ est recréé à chaque changement d'onglet, le texte reste ici
// (et au redémarrage). Un envoi le vide.
export const useDraftsStore = defineStore('drafts', () => {
  const drafts = reactive(load())
  watch(drafts, () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
    } catch {
      // Stockage plein ou refusé : le brouillon reste en mémoire jusqu'à la fermeture.
    }
  })

  function get(chatId: string): Draft | null {
    return drafts[chatId] ?? null
  }

  function set(chatId: string, text: string, attachments: Attachment[]) {
    if (!text && !attachments.length) delete drafts[chatId]
    else drafts[chatId] = { text, attachments }
  }

  // Brouillons de sessions qui n'existent plus (jamais envoyées, fermées avant le premier message).
  function prune(keep: Set<string>) {
    for (const id of Object.keys(drafts)) if (!keep.has(id)) delete drafts[id]
  }

  return { get, set, prune }
})
