<script setup lang="ts">
import { ChevronRight, CircleAlert, GitCommit, GitCompare, LoaderCircle, SendHorizontal, Undo } from '@/components/ui/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiff from '@/components/chat/ChatDiff.vue'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ShellDockToolbar from '@/components/shell/ShellDockToolbar.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useCommitRequest } from '@/composables/useCommitRequest'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangedFiles } from '@/ipc/bindings/ChangedFiles'
import type { ChangeStatus } from '@/ipc/bindings/ChangeStatus'
import type { FileDiff } from '@/ipc/bindings/FileDiff'
import { isAppError } from '@/ipc/agent'
import { worktreeChangedFiles, worktreeFileDiff, worktreeRevertFile } from '@/ipc/worktree'
import { useConversationsStore } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { type DiffComment, useDiffCommentsStore } from '@/stores/diffComments'
import { useFilesStore } from '@/stores/files'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useToastsStore } from '@/stores/toasts'
import { fileName } from '@/utils/activity'
import { agents } from '@/utils/agents'

// Modifications non commitées du dossier de la session, comme le panneau de l'app Claude Code : un fichier par
// ligne, son diff déplié dessous. Plusieurs peuvent rester ouverts pour comparer.
const { t } = useI18n()
const { chat, place } = useTerminalChat()
const { phase, commit } = useCommitRequest()
const projects = useProjectsStore()
const layout = useLayoutStore()
const toasts = useToastsStore()
const dialog = useDialogStore()
const conversations = useConversationsStore()
const comments = useDiffCommentsStore()
const sessionGit = useSessionGitStore()
const filesStore = useFilesStore()

const project = computed(() => projects.byId(chat.value?.projectId ?? null))
const listing = ref<ChangedFiles | null>(null)
const status = ref<'loading' | 'ready' | 'notRepo' | 'failed'>('loading')
const loading = ref(false)
const files = computed(() => listing.value?.files ?? [])
const added = computed(() => files.value.reduce((sum, file) => sum + file.added, 0))
const removed = computed(() => files.value.reduce((sum, file) => sum + file.removed, 0))
const { shown, more, limit, sentinel } = useProgressiveList(files, () => chat.value?.id)

const opened = reactive(new Set<string>())
const diffs = reactive(new Map<string, FileDiff | 'loading' | 'failed'>())
const list = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)

let request = 0
let loadedAt = 0
async function load() {
  const id = ++request
  loadedAt = Date.now()
  const tab = chat.value
  const path = project.value?.path
  if (!tab?.started || !path) {
    listing.value = null
    layout.changesFocus = null
    return
  }
  loading.value = true
  try {
    const result = await worktreeChangedFiles(tab.id, path)
    if (id !== request) return
    listing.value = result
    status.value = result ? 'ready' : 'notRepo'
    // Le contenu a pu changer : les diffs ouverts sont relus sans être vidés (un commentaire en cours reste), ceux des
    // fichiers commités entre-temps se ferment.
    for (const file of [...diffs.keys()]) if (!opened.has(file)) diffs.delete(file)
    for (const file of [...opened]) {
      if (result?.files.some((entry) => entry.path === file)) loadDiff(file)
      else {
        opened.delete(file)
        diffs.delete(file)
      }
    }
  } catch {
    if (id !== request) return
    listing.value = null
    status.value = 'failed'
  } finally {
    if (id === request) loading.value = false
  }
  applyFocus()
  takeFocus()
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

function toggle(file: ChangedFile) {
  if (opened.delete(file.path)) return
  opened.add(file.path)
  if (!diffs.has(file.path)) loadDiff(file.path)
}

// Fichier venu des résultats du volet Session : chemin absolu, parfois écrit autrement que la racine donnée par git
// (lien symbolique, /private sur macOS). Repli sur le plus long chemin relatif qui le termine.
function match(focus: string, result: ChangedFiles) {
  const target = focus.replaceAll('\\', '/')
  const root = result.root.replaceAll('\\', '/').replace(/\/+$/, '')
  return (
    result.files.find((file) => `${root}/${file.path}` === target) ??
    result.files.filter((file) => target.endsWith(`/${file.path}`)).sort((a, b) => b.path.length - a.path.length)[0] ??
    null
  )
}

async function applyFocus() {
  const focus = layout.changesFocus
  if (!focus || loading.value) return
  layout.changesFocus = null
  const file = listing.value ? match(focus, listing.value) : null
  if (!file) return
  if (!opened.has(file.path)) toggle(file)
  const index = files.value.indexOf(file)
  if (index >= limit.value) limit.value = index + 1
  await nextTick()
  const row = [...(list.value?.querySelectorAll<HTMLElement>('[data-change]') ?? [])].find((el) => el.dataset.change === file.path)
  row?.scrollIntoView({ block: 'start' })
}

watch(
  () => chat.value?.id,
  () => {
    opened.clear()
    diffs.clear()
    status.value = 'loading'
  },
)
watch([() => chat.value?.id, () => chat.value?.started, () => project.value?.path, () => chat.value?.worktreePath], () => load(), {
  immediate: true,
})
watch(phase, (value, previous) => {
  if (value === 'idle' && previous && previous !== 'idle') load()
})
watch(() => layout.changesFocus, applyFocus)

// Pas de bouton Actualiser : la liste se relit aussi au retour de la fenêtre, quand le pointeur entre dans le volet
// (commit fait dans un terminal) et quand l'Explorateur voit le disque changer. Au plus une fois toutes les 2 s.
function freshen() {
  const tab = chat.value
  const path = project.value?.path
  if (!tab || !path || loading.value || Date.now() - loadedAt < 2000) return
  load()
  sessionGit.refresh(tab.id, path)
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

async function takeFocus() {
  if (!layout.changesWantsFocus || loading.value) return
  layout.changesWantsFocus = false
  await nextTick()
  const target = list.value?.querySelector<HTMLElement>('[data-change] button') ?? root.value
  target?.focus()
}
watch(() => layout.changesWantsFocus, takeFocus, { immediate: true })

// Le fichier seul revient au dernier commit, après confirmation : ce qui n'y était pas est supprimé du disque.
async function revert(file: ChangedFile) {
  const tab = chat.value
  const path = project.value?.path
  if (!tab || !path) return
  const fresh = file.status === 'added' || file.status === 'untracked'
  const confirmed = await dialog.confirm({
    title: t('dock.changes.revertTitle'),
    message: t(fresh ? 'dock.changes.revertNewMessage' : 'dock.changes.revertMessage', { path: file.path }),
    confirmLabel: t('dock.changes.revertConfirm'),
    danger: true,
  })
  if (!confirmed) return
  try {
    await worktreeRevertFile(tab.id, path, file.path)
    for (const comment of commentsOf(file.path)) comments.remove(tab.id, comment.id)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('dock.changes.revertFailed'), body: isAppError(error) ? error.message : String(error) })
  }
  await load()
  sessionGit.refresh(tab.id, path)
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

function parts(file: ChangedFile) {
  const name = fileName(file.path)
  return { name, dir: file.path.slice(0, -name.length).replace(/\/+$/, '') }
}

const TONE: Record<ChangeStatus, string> = {
  added: 'text-success',
  untracked: 'text-success',
  deleted: 'text-danger line-through',
  renamed: 'text-info',
  modified: '',
}

const row = 'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-start text-[13px]'
const note = 'px-2 py-1 text-xs text-muted'
</script>

<template>
  <UiEmpty v-if="!chat?.started" :icon="GitCompare" :title="t('dock.changes.emptyTitle')" :description="t('dock.changes.empty')" />
  <UiEmpty v-else-if="!project" :icon="GitCompare" :title="t('dock.changes.noProjectTitle')" :description="t('dock.changes.noProject')" />
  <div v-else ref="root" class="flex min-h-0 flex-1 flex-col outline-none" tabindex="-1" @pointerenter="freshen">
    <ShellDockToolbar :label="t('dock.changes.title')">
      <p v-if="files.length" class="flex min-w-0 items-center gap-1.5 ps-1 text-xs">
        <span class="truncate">{{ t('dock.session.files', { n: files.length }, files.length) }}</span>
        <ChatDiffStat :added="added" :removed="removed" plain />
      </p>
      <template #end>
        <UiTooltip v-if="allComments.length" :label="sendLabel">
          <button
            type="button"
            class="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 text-xs text-canvas tabular-nums hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            :aria-label="sendLabel"
            @click="sendComments"
          >
            <SendHorizontal class="size-3.5" aria-hidden="true" />
            {{ allComments.length }}
          </button>
        </UiTooltip>
        <UiIconButton :label="t('dock.session.commit')" :disabled="!files.length || phase !== 'idle'" @click="commit">
          <GitCommit class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </template>
    </ShellDockToolbar>

    <UiEmpty v-if="status === 'notRepo'" :icon="GitCompare" :title="t('dock.changes.notRepoTitle')" :description="t('dock.changes.notRepo')" />
    <UiEmpty v-else-if="status === 'failed'" :icon="CircleAlert" :title="t('dock.changes.failedTitle')" :description="t('dock.changes.failed')" />
    <UiEmpty v-else-if="status === 'ready' && !files.length" :icon="GitCompare" :title="t('dock.changes.clean')" />
    <ul v-else-if="files.length" ref="list" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      <li v-for="file in shown" :key="file.path" :data-change="file.path" class="flex flex-col">
        <div class="group/row flex items-center rounded-lg pe-0.5 hover:bg-selection-hover">
          <button
            type="button"
            :class="row"
            class="focus-visible:outline-2 focus-visible:outline-ring"
            :aria-expanded="opened.has(file.path)"
            :title="file.oldPath ? t('dock.changes.renamedFrom', { path: file.oldPath }) : file.path"
            @click="toggle(file)"
          >
            <ChevronRight class="size-3 shrink-0 text-muted" :class="{ 'rotate-90': opened.has(file.path) }" aria-hidden="true" />
            <UiFileIcon :name="parts(file).name" class="size-4 shrink-0" />
            <span class="max-w-full min-w-0 shrink-0 truncate" :class="TONE[file.status]">{{ parts(file).name }}</span>
            <span class="min-w-0 flex-1 truncate text-muted">{{ parts(file).dir }}</span>
            <span class="sr-only">{{ t(`dock.changes.status.${file.status}`) }}</span>
            <ChatDiffStat v-if="!file.binary" :added="file.added" :removed="file.removed" plain class="text-xs" />
          </button>
          <UiIconButton
            :label="t('dock.changes.revert')"
            inner
            class="opacity-0 duration-(--hover-duration) group-hover/row:opacity-100 focus-visible:opacity-100"
            @click="revert(file)"
          >
            <Undo class="size-3.5 text-danger" aria-hidden="true" />
          </UiIconButton>
        </div>
        <div v-if="opened.has(file.path)" class="ps-2 pt-1 pb-2">
          <p v-if="diffs.get(file.path) === 'loading'" :class="note" class="flex items-center gap-1.5">
            <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {{ t('dock.changes.loading') }}
          </p>
          <p v-else-if="diffs.get(file.path) === 'failed'" :class="note">{{ t('dock.changes.diffFailed') }}</p>
          <p v-else-if="file.binary" :class="note">{{ t('dock.changes.binary') }}</p>
          <p v-else-if="diffOf(file.path)?.tooLarge" :class="note">{{ t('dock.changes.tooLarge') }}</p>
          <ChatDiff
            v-else-if="diffOf(file.path)?.patch"
            :patch="diffOf(file.path)!.patch"
            unbounded
            commentable
            :comments="commentsOf(file.path)"
            @add="addComment(file.path, $event)"
            @remove="chat && comments.remove(chat.id, $event)"
          />
          <p v-else-if="diffOf(file.path)" :class="note">{{ t('dock.changes.noText') }}</p>
        </div>
      </li>
      <li v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
    </ul>
  </div>
</template>
