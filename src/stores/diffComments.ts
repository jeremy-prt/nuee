import { defineStore } from 'pinia'
import { reactive } from 'vue'

export interface DiffComment {
  id: string
  file: string
  // old : ligne retirée, numérotée dans l'ancienne version du fichier.
  side: 'old' | 'new'
  line: number
  code: string
  body: string
}

// Commentaires posés sur les lignes du volet Git, par session, en attendant d'être envoyés ensemble.
export const useDiffCommentsStore = defineStore('diffComments', () => {
  const byChat = reactive<Record<string, DiffComment[]>>({})

  function list(chatId: string) {
    return byChat[chatId] ?? []
  }

  function add(chatId: string, comment: Omit<DiffComment, 'id'>) {
    byChat[chatId] = [...list(chatId), { ...comment, id: crypto.randomUUID() }]
  }

  function remove(chatId: string, id: string) {
    byChat[chatId] = list(chatId).filter((comment) => comment.id !== id)
  }

  function clear(chatId: string) {
    delete byChat[chatId]
  }

  return { list, add, remove, clear }
})
