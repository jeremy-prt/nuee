import { useI18n } from 'vue-i18n'
import { useSkillChat } from '@/composables/useSkillChat'
import type { Note } from '@/ipc/bindings/Note'
import { useDraftsStore } from '@/stores/drafts'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

// Gestes sur une note, communs au bouton de la note ouverte et à son menu (clic droit dans la liste, « … »).
export function useNoteActions() {
  const { t } = useI18n()
  const drafts = useDraftsStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const skillChat = useSkillChat()

  // Nouvelle session dans le projet de la note, sa mention déjà dans le champ.
  function send(note: Note) {
    if (!note.slug) return
    navigation.openChats(note.projectId)
    workspace.showBlank()
    const chatId = workspace.activeTabId
    if (chatId) drafts.requestInsert(chatId, `#${note.slug} `)
  }

  async function toSkill(note: Note) {
    if (!note.slug) return
    const before = workspace.activeTabId
    await skillChat({ kind: 'createSkill' })
    const chatId = workspace.activeTabId
    if (chatId && chatId !== before) drafts.requestInsert(chatId, t('notes.toSkillPrompt', { mention: `#${note.slug}` }))
  }

  function copy(note: Note) {
    void navigator.clipboard.writeText(note.body).catch(() => {})
  }

  return { send, toSkill, copy }
}
