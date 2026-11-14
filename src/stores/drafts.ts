import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
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

  // Message demandé depuis un volet : la session l'envoie dès qu'elle est affichée, comme s'il venait du champ.
  const requested = ref<{ chatId: string; text: string } | null>(null)

  function request(chatId: string, text: string) {
    requested.value = { chatId, text }
  }

  // Fichiers joints depuis un volet : la session les passe au `attach` de son champ, comme un dépôt.
  const attachRequested = ref<{ chatId: string; paths: string[] } | null>(null)

  function requestAttach(chatId: string, paths: string[]) {
    attachRequested.value = { chatId, paths }
  }

  // Brouillons de sessions qui n'existent plus (jamais envoyées, fermées avant le premier message).
  function prune(keep: Set<string>) {
    for (const id of Object.keys(drafts)) if (!keep.has(id)) delete drafts[id]
  }

  // Texte ajouté au champ sans l'envoyer (mention d'une note depuis la page Notes).
  const insertRequested = ref<{ chatId: string; text: string } | null>(null)

  function requestInsert(chatId: string, text: string) {
    insertRequested.value = { chatId, text }
  }

  return { requested, attachRequested, insertRequested, get, set, request, requestAttach, requestInsert, prune }
})
