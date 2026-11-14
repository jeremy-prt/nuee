import { type InjectionKey, computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGitActions } from '@/composables/useGitActions'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangedFiles } from '@/ipc/bindings/ChangedFiles'
import type { FileDiff } from '@/ipc/bindings/FileDiff'
import { worktreeChangedFiles, worktreeFileDiff, worktreeRevertAll, worktreeRevertFile } from '@/ipc/worktree'
import { useConversationsStore } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { type DiffComment, useDiffCommentsStore } from '@/stores/diffComments'
import { useFilesStore } from '@/stores/files'
import { useGitActionsStore } from '@/stores/gitActions'
import { useGitPanelStore } from '@/stores/gitPanel'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useToastsStore } from '@/stores/toasts'
import { agents } from '@/utils/agents'

export type GitChanges = ReturnType<typeof useGitChanges>
export const GIT_CHANGES: InjectionKey<GitChanges> = Symbol('gitChanges')

export type DiffState = FileDiff | 'loading' | 'failed'

// Changements non commités du dossier de la session (volet Git) : la liste, les diffs lus (dépliés dans la liste ou
// ouverts à gauche), les annulations et les commentaires de lignes. Une instance par volet, partagée par `provide`.
// Avant le premier message, le dossier où la session va travailler se lit déjà, sauf un worktree encore à créer.
export function useGitChanges() {
  const { t } = useI18n()
  const { chat, place } = useTerminalChat()
  const { phase } = useGitActions()
  const projects = useProjectsStore()
  const toasts = useToastsStore()
  const dialog = useDialogStore()
  const conversations = useConversationsStore()
  const comments = useDiffCommentsStore()
  const sessionGit = useSessionGitStore()
  const filesStore = useFilesStore()
  const gitActions = useGitActionsStore()
  const gitPanel = useGitPanelStore()

  const project = computed(() => projects.byId(chat.value?.projectId ?? null))
  const pending = computed(() => !!chat.value?.worktree && !chat.value.worktreePath)
  // Commit, actions de fond et commentaires partent dans la conversation : pas avant son premier message.
  const readOnly = computed(() => !chat.value?.started)
  // Une action de fond ou un commit direct travaille dans ce dossier : rien ne s'y annule pendant ce temps.
  const acting = computed(() => {
    const folder = gitActions.folderOf(chat.value)
    return !!folder && (gitActions.runs.has(folder) || gitActions.manual.has(folder))
  })
  const listing = ref<ChangedFiles | null>(null)
  const status = ref<'loading' | 'ready' | 'notRepo' | 'failed'>('loading')
  const loading = ref(false)
  const files = computed(() => listing.value?.files ?? [])

  // Fichiers dépliés dans la liste (panneau étroit ou partagé) ; les onglets de gauche sont dans `gitPanel`.
  const opened = reactive(new Set<string>())
  const diffs = reactive(new Map<string, DiffState>())
  const workTabs = () => (chat.value ? gitPanel.of(chat.value.id).tabs.filter((tab) => tab.kind === 'work').map((tab) => tab.path) : [])

  let request = 0
  let loadedAt = 0
  async function load() {
    const id = ++request
    loadedAt = Date.now()
    const tab = chat.value
    const path = project.value?.path
    if (!tab || !path || pending.value) {
      listing.value = null
      loading.value = false
      return
    }
    loading.value = true
    try {
      const result = await worktreeChangedFiles(tab.id, path)
      if (id !== request) return
      listing.value = result
      status.value = result ? 'ready' : 'notRepo'
      // Le contenu a pu changer : les diffs montrés sont relus sans être vidés (un commentaire en cours reste), ceux des
      // fichiers commités entre-temps se ferment.
      const present = new Set(result?.files.map((file) => file.path) ?? [])
      const shown = new Set([...opened, ...workTabs()])
      for (const file of [...diffs.keys()]) if (!shown.has(file) || !present.has(file)) diffs.delete(file)
      for (const file of [...opened]) if (!present.has(file)) opened.delete(file)
      gitPanel.keepWork(tab.id, present)
      for (const file of shown) if (present.has(file)) loadDiff(file)
    } catch {
      if (id !== request) return
      listing.value = null
      status.value = 'failed'
    } finally {
      if (id === request) loading.value = false
    }
  }

  async function loadDiff(file: string) {
    const tab = chat.value
    const path = project.value?.path
    if (!tab || !path) return
    const id = request
    if (typeof diffs.get(file) !== 'object') diffs.set(file, 'loading')
    try {
      const diff = await worktreeFileDiff(tab.id, path, file)
      if (id === request) diffs.set(file, diff)
    } catch {
      if (id === request) diffs.set(file, 'failed')
    }
  }

  function diffOf(file: string) {
    const diff = diffs.get(file)
    return typeof diff === 'object' ? diff : null
  }

  function ensureDiff(file: string) {
    if (!diffs.has(file)) loadDiff(file)
  }

  function toggle(file: ChangedFile) {
    if (opened.delete(file.path)) return
    opened.add(file.path)
    ensureDiff(file.path)
  }

  watch(
    () => chat.value?.id,
    () => {
      opened.clear()
      diffs.clear()
      listing.value = null
      status.value = 'loading'
    },
  )
  watch([() => chat.value?.id, () => project.value?.path, () => chat.value?.worktree, () => chat.value?.worktreePath], () => load(), {
    immediate: true,
  })
  watch(phase, (value, previous) => {
    if (value === 'idle' && previous && previous !== 'idle') load()
  })
  // Fin d'une action git (de fond ou directe) sur ce dossier : commit ou annulation ont changé la liste.
  watch(
    () => gitActions.settled[gitActions.folderOf(chat.value) ?? ''],
    () => load(),
  )

  // En plus du bouton Actualiser, la liste se relit au retour de la fenêtre, quand le pointeur entre dans le volet
  // (commit fait dans un terminal) et quand l'Explorateur voit le disque changer. Au plus une fois toutes les 2 s.
  function freshen() {
    const tab = chat.value
    const path = project.value?.path
    if (!tab || !path || loading.value || Date.now() - loadedAt < 2000) return
    load()
    if (tab.started) sessionGit.refresh(tab.id, path)
  }
  async function refresh() {
    const tab = chat.value
    const path = project.value?.path
    if (!tab || !path) return
    await Promise.all([load(), tab.started && sessionGit.refresh(tab.id, path)])
  }
  let diskTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => (chat.value ? filesStore.of(chat.value.id).disk : 0),
    () => {
      clearTimeout(diskTimer)
      // Pendant un tour, la fin du tour relira la liste.
      if (phase.value === 'idle') diskTimer = setTimeout(freshen, 500)
    },
  )
  onMounted(() => window.addEventListener('focus', freshen))
  onBeforeUnmount(() => {
    window.removeEventListener('focus', freshen)
    clearTimeout(diskTimer)
  })

  function failed(title: string, error: unknown) {
    toasts.push({ kind: 'error', title, body: isAppError(error) ? error.message : String(error) })
  }

  // Le fichier seul revient au dernier commit, après confirmation : ce qui n'y était pas est supprimé du disque.
  async function revert(file: ChangedFile) {
    const tab = chat.value
    const path = project.value?.path
    if (!tab || !path || acting.value) return
    const fresh = file.status === 'added' || file.status === 'untracked'
    const confirmed = await dialog.confirm({
      title: t('dock.changes.revertTitle'),
      message: t(fresh ? 'dock.changes.revertNewMessage' : 'dock.changes.revertMessage', { path: file.path }),
      confirmLabel: t('dock.changes.revertConfirm'),
      danger: true,
    })
    if (!confirmed || acting.value) return
    try {
      await worktreeRevertFile(tab.id, path, file.path)
      for (const comment of commentsOf(file.path)) comments.remove(tab.id, comment.id)
    } catch (error) {
      failed(t('dock.changes.revertFailed'), error)
    }
    await refresh()
  }

  async function revertAll() {
    const tab = chat.value
    const path = project.value?.path
    // Seuls les fichiers que montre la confirmation : un fichier créé entre-temps par un agent reste.
    const shown = files.value.map((file) => file.path)
    if (!tab || !path || !shown.length || acting.value) return
    const confirmed = await dialog.confirm({
      title: t('dock.changes.revertAllTitle'),
      message: t('dock.changes.revertAllMessage', { n: shown.length }, shown.length),
      confirmLabel: t('dock.changes.revertAllConfirm'),
      danger: true,
    })
    if (!confirmed || acting.value) return
    try {
      const kept = await worktreeRevertAll(tab.id, path, shown)
      for (const comment of [...allComments.value]) if (shown.includes(comment.file) && !kept.includes(comment.file)) comments.remove(tab.id, comment.id)
      if (kept.length) toasts.push({ title: t('dock.changes.nestedKept', { n: kept.length }, kept.length), body: kept.join('\n') })
    } catch (error) {
      failed(t('dock.changes.revertFailed'), error)
    }
    await refresh()
  }

  const allComments = computed(() => (chat.value ? comments.list(chat.value.id) : []))
  const sendLabel = computed(() =>
    t('dock.changes.commentsSend', { agent: chat.value ? agents[chat.value.agent].name : '', n: allComments.value.length }, allComments.value.length),
  )

  function commentsOf(file: string) {
    return allComments.value.filter((comment) => comment.file === file)
  }

  function addComment(file: string, comment: Omit<DiffComment, 'id' | 'file'>) {
    if (chat.value) comments.add(chat.value.id, { ...comment, file })
  }

  function removeComment(id: string) {
    if (chat.value) comments.remove(chat.value.id, id)
  }

  // Tous les commentaires partent dans un seul message, comme la relecture de l'app Claude.
  function sendComments() {
    const tab = chat.value
    if (!tab || !place.value || !allComments.value.length || !conversations.find(tab.id)?.loaded) return
    const blocks = allComments.value.map((comment) =>
      [
        t(comment.side === 'old' ? 'dock.changes.commentAtOld' : 'dock.changes.commentAt', { path: comment.file, line: comment.line }),
        comment.code.trim() ? `> ${comment.code}` : '',
        comment.body,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    conversations.send(tab.id, place.value, [t('dock.changes.commentsPrompt'), ...blocks].join('\n\n'), [])
    comments.clear(tab.id)
  }

  return {
    chat,
    project,
    pending,
    readOnly,
    acting,
    listing,
    status,
    loading,
    files,
    opened,
    diffs,
    ensureDiff,
    diffOf,
    toggle,
    freshen,
    refresh,
    revert,
    revertAll,
    allComments,
    sendLabel,
    commentsOf,
    addComment,
    removeComment,
    sendComments,
  }
}
