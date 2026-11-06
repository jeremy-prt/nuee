import { defineStore } from 'pinia'
import { type InjectionKey, type Ref, shallowReactive } from 'vue'
import { projectFiles } from '@/ipc/project'
import { useGeneralStore } from '@/stores/general'

// Session et dossier de projet du pane, pour que `ChatPromptText` ne colore que les `@` qui citent un vrai fichier.
export const mentionPlaceKey: InjectionKey<Ref<{ chatId: string; project: string } | null>> = Symbol('mentionPlace')

// Fichiers et dossiers (finis par « / ») de chaque session, relatifs à son dossier.
export const useMentionsStore = defineStore('mentions', () => {
  const known = shallowReactive(new Map<string, ReadonlySet<string>>())
  const pending = new Map<string, Promise<string[]>>()

  async function read(chatId: string, project: string) {
    let paths: string[] = []
    try {
      const files = await projectFiles(chatId, project, useGeneralStore().mentionIgnored)
      const folders = new Set<string>()
      for (const file of files) {
        for (let cut = file.indexOf('/'); cut !== -1; cut = file.indexOf('/', cut + 1)) folders.add(file.slice(0, cut + 1))
      }
      paths = [...folders, ...files]
    } catch {
      // Dossier du projet effacé ou déplacé : aucun fichier à citer.
    }
    known.set(chatId, new Set(paths))
    return paths
  }

  /** Relit la liste (ouverture du menu « @ »). */
  function load(chatId: string, project: string) {
    const promise = read(chatId, project).finally(() => pending.delete(chatId))
    pending.set(chatId, promise)
    return promise
  }

  /** Lit la liste une seule fois par session. */
  function ensure(chatId: string, project: string) {
    if (!known.has(chatId) && !pending.has(chatId)) load(chatId, project)
  }

  return { known, load, ensure }
})
