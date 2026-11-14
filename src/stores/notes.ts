import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { Note } from '@/ipc/bindings/Note'
import { isAppError } from '@/ipc/agent'
import { noteDelete, noteList, noteSave, noteSummarize } from '@/ipc/note'
import { useConversationsStore } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { useToastsStore } from '@/stores/toasts'
import { useWorkspaceStore } from '@/stores/workspace'
import { noteTitle, sessionTranscript } from '@/utils/notes'

// Une frappe n'écrit pas la base à chaque lettre.
const SAVE_DELAY = 400
// `#<slug>` en début de mot, comme les mentions de fichiers ; `@` reste aux fichiers du projet.
const MENTION = /(?:^|\s)#([a-z0-9-]+)/g

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const bySlug = computed(() => new Map(notes.value.flatMap((note) => (note.slug ? [[note.slug, note] as const] : []))))
  const slugs = computed(() => new Set(bySlug.value.keys()))
  // Sessions dont le champ est en mode « Résumer en note », et celles dont le résumé s'écrit.
  const summaryMode = reactive(new Set<string>())
  const summarizing = reactive(new Set<string>())
  const timers = new Map<string, number>()
  // Note ouverte dans la page, gardée d'une visite à l'autre.
  const selectedId = ref<string | null>(null)

  async function load() {
    if (loading.value) return
    loading.value = true
    try {
      notes.value = await noteList()
      loaded.value = true
    } catch (error) {
      console.error('notes', error)
    } finally {
      loading.value = false
    }
  }

  function ensure() {
    if (!loaded.value) void load()
  }

  function byId(id: string | null) {
    return notes.value.find((note) => note.id === id) ?? null
  }

  // Le titre et le texte restent ceux de l'écran : une frappe faite pendant l'écriture ne doit pas être écrasée.
  function adopt(saved: Note) {
    const index = notes.value.findIndex((note) => note.id === saved.id)
    if (index === -1) notes.value = [saved, ...notes.value]
    else {
      const local = notes.value[index]!
      notes.value[index] = { ...saved, title: local.title, body: local.body }
    }
  }

  async function write(note: Note) {
    clearTimeout(timers.get(note.id))
    timers.delete(note.id)
    try {
      adopt(await noteSave({ id: note.id, title: note.title, body: note.body, projectId: note.projectId, sourceChatId: note.sourceChatId }))
    } catch (error) {
      const { t } = i18nGlobal()
      useToastsStore().push({ kind: 'error', title: t('notes.saveFailed'), body: isAppError(error) ? error.message : String(error) })
    }
  }

  async function create(fields: Partial<Pick<Note, 'title' | 'body' | 'projectId' | 'sourceChatId'>> = {}) {
    const now = Date.now()
    const note: Note = { id: crypto.randomUUID(), slug: null, title: '', body: '', projectId: null, sourceChatId: null, createdAt: now, updatedAt: now, ...fields }
    notes.value = [note, ...notes.value]
    await write(note)
    return byId(note.id) ?? note
  }

  // Modification à l'écran : la liste suit tout de suite, la base un peu après.
  function update(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'projectId'>>) {
    const index = notes.value.findIndex((note) => note.id === id)
    if (index === -1) return
    const note = { ...notes.value[index]!, ...patch, updatedAt: Date.now() }
    notes.value = [note, ...notes.value.filter((other) => other.id !== id)]
    clearTimeout(timers.get(id))
    timers.set(id, window.setTimeout(() => void write(byId(id) ?? note), SAVE_DELAY))
  }

  // Écrit tout de suite ce qui attend (changement de note, sortie de la page).
  async function flush(id: string) {
    if (!timers.has(id)) return
    const note = byId(id)
    if (note) await write(note)
  }

  // La note ouverte supprimée laisse la place à la suivante du même projet.
  async function remove(id: string) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    await noteDelete(id)
    const projectId = byId(id)?.projectId ?? null
    notes.value = notes.value.filter((note) => note.id !== id)
    if (selectedId.value === id) selectedId.value = notes.value.find((note) => note.projectId === projectId)?.id ?? null
  }

  // Depuis la liste ou la note ouverte : toujours après confirmation.
  async function confirmRemove(id: string) {
    const { t } = i18nGlobal()
    const confirmed = await useDialogStore().confirm({
      title: t('notes.delete.title'),
      message: t('notes.delete.message', { title: byId(id)?.title || t('notes.untitled') }),
      confirmLabel: t('notes.delete.confirm'),
      danger: true,
    })
    if (!confirmed) return
    try {
      await remove(id)
    } catch (error) {
      useToastsStore().push({ kind: 'error', title: t('notes.deleteFailed'), body: isAppError(error) ? error.message : String(error) })
    }
  }

  // Réponse ou sélection enregistrée depuis une session : rangée dans son projet.
  async function saveText(text: string, chatId: string) {
    ensure()
    const projectId = useWorkspaceStore().tabs.find((tab) => tab.id === chatId)?.projectId ?? null
    return create({ title: noteTitle(text), body: text.trim(), projectId, sourceChatId: chatId })
  }

  // Message pour l'agent : le contenu de chaque note mentionnée, après le texte de l'utilisateur.
  function expand(prompt: string) {
    const found = new Set<string>()
    for (const match of prompt.matchAll(MENTION)) found.add(match[1]!)
    const { t } = i18nGlobal()
    const blocks = [...found].flatMap((slug) => {
      const note = bySlug.value.get(slug)
      return note ? [t('operator.note', { title: note.title, mention: `#${slug}`, body: note.body })] : []
    })
    return blocks.length ? `${prompt}\n\n${blocks.join('\n\n')}` : prompt
  }

  // Résumé de la session en note, sans tour d'agent ; la conversation y gagne une carte qui mène à la note.
  async function summarize(chatId: string, focus: string) {
    const conversations = useConversationsStore()
    const conversation = conversations.find(chatId)
    if (!conversation || summarizing.has(chatId)) return
    summaryMode.delete(chatId)
    summarizing.add(chatId)
    const { t } = i18nGlobal()
    try {
      const note = await noteSummarize({
        id: crypto.randomUUID(),
        agent: conversation.agent,
        headings: (['goal', 'decisions', 'pitfalls', 'commands', 'files', 'todo'] as const).map((key) => t(`notes.summary.headings.${key}`)),
        focus,
        transcript: sessionTranscript(conversation.items, { user: t('notes.transcript.user'), agent: t('notes.transcript.agent') }),
        projectId: useWorkspaceStore().tabs.find((tab) => tab.id === chatId)?.projectId ?? null,
        chatId,
      })
      ensure()
      adopt(note)
      conversations.note(chatId, { kind: 'note', id: crypto.randomUUID(), at: Date.now(), noteId: note.id, title: note.title, focus: focus || undefined })
    } catch (error) {
      useToastsStore().push({ kind: 'error', title: t('notes.summary.failed'), body: isAppError(error) ? error.message : String(error) })
    } finally {
      summarizing.delete(chatId)
    }
  }

  return { notes, loaded, loading, slugs, bySlug, summaryMode, summarizing, selectedId, load, ensure, byId, create, update, flush, remove, confirmRemove, saveText, expand, summarize }
})
