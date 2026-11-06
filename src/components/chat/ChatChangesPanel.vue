<script setup lang="ts">
import { ChevronRight, LoaderCircle, RefreshCw } from '@/components/ui/icons'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiff from '@/components/chat/ChatDiff.vue'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useCommitRequest } from '@/composables/useCommitRequest'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangedFiles } from '@/ipc/bindings/ChangedFiles'
import type { ChangeStatus } from '@/ipc/bindings/ChangeStatus'
import type { FileDiff } from '@/ipc/bindings/FileDiff'
import { worktreeChangedFiles, worktreeFileDiff } from '@/ipc/worktree'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { fileName } from '@/utils/activity'

// Modifications non commitées du dossier de la session, comme le panneau de l'app Claude Code : un fichier par
// ligne, son diff déplié dessous. Plusieurs peuvent rester ouverts pour comparer.
const { t } = useI18n()
const { chat } = useTerminalChat()
const { phase, commit } = useCommitRequest()
const projects = useProjectsStore()
const layout = useLayoutStore()
const toasts = useToastsStore()

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

let request = 0
async function load(manual = false) {
  const id = ++request
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
    // Le contenu a pu changer : les diffs ouverts sont relus, ceux des fichiers commités entre-temps se ferment.
    diffs.clear()
    for (const file of [...opened]) {
      if (result?.files.some((entry) => entry.path === file)) loadDiff(file)
      else opened.delete(file)
    }
    if (manual) {
      const count = result?.files.length ?? 0
      const body = !result ? t('dock.changes.notRepo') : count ? t('dock.session.files', { n: count }, count) : t('dock.changes.clean')
      toasts.push({ kind: 'success', title: t('dock.changes.refreshed'), body })
    }
  } catch {
    if (id !== request) return
    listing.value = null
    status.value = 'failed'
  } finally {
    if (id === request) loading.value = false
  }
  applyFocus()
}

async function loadDiff(file: string) {
  const tab = chat.value
  const path = project.value?.path
  if (!tab || !path) return
  const id = request
  diffs.set(file, 'loading')
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
  <p v-if="!chat?.started" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.changes.empty') }}</p>
  <p v-else-if="!project" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.changes.noProject') }}</p>
  <div v-else class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-col gap-1 border-b border-stroke p-2">
      <div class="flex h-7 items-center gap-2 ps-2">
        <span class="min-w-0 flex-1 truncate text-xs" :class="{ 'text-muted': !files.length }">
          <template v-if="files.length">{{ t('dock.session.files', { n: files.length }, files.length) }}</template>
          <template v-else-if="status === 'ready'">{{ t('dock.changes.clean') }}</template>
        </span>
        <ChatDiffStat v-if="files.length" :added="added" :removed="removed" plain class="text-xs" />
        <UiIconButton :label="t('dock.changes.refresh')" :loading="loading" @click="load(true)">
          <RefreshCw class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </div>
      <UiButton v-if="files.length" size="sm" :disabled="phase !== 'idle'" @click="commit">{{ t('dock.session.commit') }}</UiButton>
    </div>

    <p v-if="status === 'notRepo'" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.changes.notRepo') }}</p>
    <p v-else-if="status === 'failed'" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.changes.failed') }}</p>
    <ul v-else-if="files.length" ref="list" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      <li v-for="file in shown" :key="file.path" :data-change="file.path" class="flex flex-col">
        <button
          type="button"
          :class="row"
          class="hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring"
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
        <div v-if="opened.has(file.path)" class="ps-2 pt-1 pb-2">
          <p v-if="diffs.get(file.path) === 'loading'" :class="note" class="flex items-center gap-1.5">
            <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {{ t('dock.changes.loading') }}
          </p>
          <p v-else-if="diffs.get(file.path) === 'failed'" :class="note">{{ t('dock.changes.diffFailed') }}</p>
          <p v-else-if="file.binary" :class="note">{{ t('dock.changes.binary') }}</p>
          <p v-else-if="diffOf(file.path)?.tooLarge" :class="note">{{ t('dock.changes.tooLarge') }}</p>
          <ChatDiff v-else-if="diffOf(file.path)?.patch" :patch="diffOf(file.path)!.patch" unbounded />
          <p v-else-if="diffOf(file.path)" :class="note">{{ t('dock.changes.noText') }}</p>
        </div>
      </li>
      <li v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
    </ul>
  </div>
</template>
