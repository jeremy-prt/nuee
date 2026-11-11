<script setup lang="ts">
import { Copy, GitCommit, LoaderCircle, Search, X } from '@/components/ui/icons'
import { computed, inject, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GitBranchRow from '@/components/git/GitBranchRow.vue'
import GitDiffBody from '@/components/git/GitDiffBody.vue'
import GitFileList from '@/components/git/GitFileList.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import { field, fieldText } from '@/components/ui/field'
import { useDebounced } from '@/composables/useDebounced'
import { useGitActions } from '@/composables/useGitActions'
import { type DiffState, GIT_CHANGES } from '@/composables/useGitChanges'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { CommitEntry } from '@/ipc/bindings/CommitEntry'
import { worktreeCommitDiff, worktreeCommitFiles, worktreeLog } from '@/ipc/worktree'
import { useGitActionsStore } from '@/stores/gitActions'
import { commitKey, useGitPanelStore } from '@/stores/gitPanel'
import { useToastsStore } from '@/stores/toasts'

// Mode Historique du volet Git, comme monocode : les commits de la branche courante en chronologie, 50 à la fois, la
// suite au défilement (une page de recherche peut revenir vide avec une suite, le témoin la demande aussitôt). Un clic
// montre les fichiers du commit, un fichier son diff à gauche (`side`) ou dessous. Recherche : `searching`.
const props = defineProps<{ side: boolean }>()
const searching = defineModel<boolean>('searching', { default: false })

const { t, locale } = useI18n()
const changes = inject(GIT_CHANGES)!
const { phase } = useGitActions()
const gitActions = useGitActionsStore()
const gitPanel = useGitPanelStore()
const toasts = useToastsStore()

const chat = changes.chat
const path = computed(() => changes.project.value?.path ?? null)
const query = ref('')
const search = useDebounced(query, 250)

const commits = ref<CommitEntry[]>([])
const next = ref<number | null>(0)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const busy = ref(false)
let generation = 0

async function more() {
  const id = generation
  const tab = chat.value
  if (!tab || !path.value || changes.pending.value || next.value === null || busy.value) return
  busy.value = true
  try {
    const page = await worktreeLog(tab.id, path.value, next.value, search.value.trim() || null)
    if (id !== generation) return
    // Un commit fait pendant le défilement décale les pages : celui déjà là revient en tête de la suivante.
    const seen = new Set(commits.value.map((commit) => commit.sha))
    commits.value = [...commits.value, ...page.commits.filter((commit) => !seen.has(commit.sha))]
    next.value = page.next
    status.value = 'ready'
  } catch {
    if (id === generation) status.value = 'failed'
  } finally {
    if (id === generation) busy.value = false
  }
}

// Repart de la première page ; les commits dépliés et leurs fichiers restent si on les retrouve.
function reload() {
  generation++
  busy.value = false
  commits.value = []
  next.value = 0
  status.value = 'loading'
  return more()
}
watch([() => chat.value?.id, path, search, () => changes.status.value === 'notRepo', () => chat.value?.worktreePath, changes.pending], reload, {
  immediate: true,
})
watch(
  () => gitActions.settled[gitActions.folderOf(chat.value) ?? ''],
  () => reload(),
)
watch(phase, (value, previous) => {
  if (value === 'idle' && previous && previous !== 'idle') reload()
})

async function refresh() {
  await reload()
  toasts.push({ title: t('feedback.listRefreshed'), body: next.value === null ? t('dock.changes.history.count', { n: commits.value.length }, commits.value.length) : (commits.value[0]?.subject ?? '') })
}
defineExpose({ refresh, loading: computed(() => busy.value && !commits.value.length) })

// Fermer la recherche vide le champ ; l'ouvrir y met le focus.
const searchField = useTemplateRef('searchField')
watch(searching, async (open) => {
  if (!open) query.value = ''
  else {
    await nextTick()
    searchField.value?.focus()
  }
})
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  if (query.value) query.value = ''
  else searching.value = false
}

// Témoin en bas de liste, recréé à chaque page (`:key`) : resté visible après une page vide de la recherche, l'ancien
// ne se signalerait plus.
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
watch(sentinel, (element) => {
  observer?.disconnect()
  if (!element) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) more()
  })
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

// ===== Commit déplié =====

const expanded = reactive(new Set<string>())
const files = reactive(new Map<string, ChangedFile[] | 'loading' | 'failed'>())
async function toggle(commit: CommitEntry) {
  if (expanded.delete(commit.sha)) return
  expanded.add(commit.sha)
  if (files.has(commit.sha) || !chat.value || !path.value) return
  files.set(commit.sha, 'loading')
  try {
    files.set(commit.sha, await worktreeCommitFiles(chat.value.id, path.value, commit.sha))
  } catch {
    files.set(commit.sha, 'failed')
  }
}
const listOf = (sha: string) => {
  const value = files.get(sha)
  return Array.isArray(value) ? value : []
}

const inlineOpen = reactive(new Set<string>())
const inlineDiffs = reactive(new Map<string, DiffState>())
const view = computed(() => (chat.value ? gitPanel.of(chat.value.id) : null))
function activeIn(sha: string) {
  const open = view.value?.tabs.find((tab) => tab.key === view.value?.open)
  return props.side && open?.kind === 'commit' && open.sha === sha ? open.path : null
}

async function openFile(commit: CommitEntry, file: ChangedFile, pin = false) {
  const tab = chat.value
  if (!tab || !path.value) return
  const key = commitKey(commit.sha, file.path)
  if (props.side) return gitPanel.openDiff(tab.id, { kind: 'commit', key, sha: commit.sha, short: commit.short, path: file.path }, pin)
  if (inlineOpen.delete(key)) return
  inlineOpen.add(key)
  if (inlineDiffs.has(key)) return
  inlineDiffs.set(key, 'loading')
  try {
    inlineDiffs.set(key, await worktreeCommitDiff(tab.id, path.value, commit.sha, file.path))
  } catch {
    inlineDiffs.set(key, 'failed')
  }
}
const openedIn = (sha: string) => new Set([...inlineOpen].filter((key) => key.startsWith(`commit:${sha}:`)).map((key) => key.slice(`commit:${sha}:`.length)))

// ===== Affichage =====

const dates = computed(() => ({
  short: new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }),
  year: new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }),
  full: new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'short' }),
}))
const thisYear = new Date().getFullYear()
function dateOf(commit: CommitEntry) {
  const date = new Date(commit.date * 1000)
  return (date.getFullYear() === thisYear ? dates.value.short : dates.value.year).format(date)
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toasts.push({ title: t('dock.changes.history.copied'), body: text })
  } catch {
    // Presse-papiers refusé : rien à annoncer de plus.
  }
}

const note = 'px-3 py-6 text-center text-xs text-muted'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <p v-if="!changes.project.value" :class="note">{{ t('dock.changes.noProject') }}</p>
    <p v-else-if="changes.pending.value" :class="note">{{ t('dock.changes.pending') }}</p>
    <p v-else-if="changes.status.value === 'notRepo'" :class="note">{{ t('dock.changes.notRepo') }}</p>
    <template v-else>
      <div class="flex shrink-0 flex-col gap-1.5 border-b border-stroke p-2">
        <GitBranchRow />
        <label v-if="searching" :class="field" data-control>
          <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <input
            ref="searchField"
            v-model="query"
            type="text"
            :class="fieldText"
            :placeholder="t('dock.changes.history.search')"
            :aria-label="t('dock.changes.history.search')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            writingsuggestions="false"
            @keydown="onSearchKeydown"
          />
          <button v-if="query" type="button" class="-me-1 grid size-5 place-items-center rounded text-muted hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring" :aria-label="t('dock.changes.history.clear')" @click="query = ''">
            <X class="size-3" aria-hidden="true" />
          </button>
        </label>
      </div>

      <p v-if="status === 'failed'" :class="[note, 'text-danger!']" role="alert">{{ t('dock.changes.history.failed') }}</p>
      <p v-else-if="status === 'loading' && !commits.length" :class="note" class="flex items-center justify-center gap-1.5" role="status">
        <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('dock.changes.history.loading') }}
      </p>
      <p v-else-if="!commits.length && next === null" :class="note">{{ search ? t('dock.changes.history.noMatch') : t('dock.changes.history.noCommits') }}</p>
      <ol v-else class="min-h-0 flex-1 overflow-y-auto p-2" :aria-label="t('dock.changes.modes.history')">
        <li v-for="(commit, at) in commits" :key="commit.sha" class="relative">
          <!-- Chronologie : un trait continu d'un commit à l'autre, coupé avant le premier et après le dernier. -->
          <span
            class="pointer-events-none absolute start-[13px] w-px bg-stroke"
            :class="[at === 0 ? 'top-[22px]' : 'top-0', at === commits.length - 1 && next === null ? 'h-[22px]' : 'bottom-0']"
            aria-hidden="true"
          />
          <UiContextMenu>
            <div class="group/row flex h-11 items-stretch rounded-lg" :class="expanded.has(commit.sha) ? 'bg-selection' : 'hover:bg-selection-hover'">
              <span class="relative grid w-7 shrink-0 place-items-center" aria-hidden="true">
                <span
                  class="relative rounded-full border-2"
                  :class="at === 0 && !search ? 'size-2.5 border-accent bg-accent' : 'size-2 border-muted bg-canvas'"
                />
              </span>
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-lg pe-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                :aria-expanded="expanded.has(commit.sha)"
                :title="`${commit.short} ${commit.subject} · ${commit.author}`"
                @click="toggle(commit)"
              >
                <span class="flex min-w-0 items-center gap-1">
                  <span class="min-w-0 flex-1 truncate text-[12px] leading-4" :class="{ 'font-medium': at === 0 && !search }">{{ commit.subject || commit.short }}</span>
                  <span
                    v-if="commit.refs.length"
                    class="max-w-26 shrink-0 truncate rounded-full px-1.5 text-[10px] leading-3.5"
                    :class="at === 0 && !search ? 'bg-accent text-canvas' : 'bg-content/8 text-muted'"
                    :title="commit.refs.join(', ')"
                  >{{ commit.refs[0] }}</span>
                </span>
                <span class="flex min-w-0 items-center gap-1.5 text-[10px] leading-3.5 text-muted">
                  <span class="min-w-0 flex-1 truncate">{{ commit.author }}</span>
                  <time class="shrink-0" :datetime="new Date(commit.date * 1000).toISOString()" :title="dates.full.format(commit.date * 1000)">{{ dateOf(commit) }}</time>
                  <span class="shrink-0 font-mono opacity-80">{{ commit.short }}</span>
                </span>
              </button>
              <span class="flex shrink-0 items-center pe-1 opacity-0 duration-(--hover-duration) group-hover/row:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
                <UiMoreMenu :label="t('dock.changes.history.actions')" tooltip-side="bottom">
                  <UiMenuItem :label="t('dock.changes.history.copySha')" :icon="GitCommit" @select="copy(commit.sha)" />
                  <UiMenuItem :label="t('dock.changes.history.copySubject')" :icon="Copy" @select="copy(commit.subject)" />
                </UiMoreMenu>
              </span>
            </div>
            <template #menu>
              <UiMenuItem :label="t('dock.changes.history.copySha')" :icon="GitCommit" @select="copy(commit.sha)" />
              <UiMenuItem :label="t('dock.changes.history.copySubject')" :icon="Copy" @select="copy(commit.subject)" />
            </template>
          </UiContextMenu>
          <div v-if="expanded.has(commit.sha)" class="ps-6 pt-0.5 pb-1" role="group" :aria-label="t('dock.changes.history.files', { short: commit.short })">
            <p v-if="files.get(commit.sha) === 'loading'" class="flex items-center gap-1.5 px-2 py-1 text-xs text-muted" role="status">
              <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {{ t('dock.changes.loading') }}
            </p>
            <p v-else-if="files.get(commit.sha) === 'failed'" class="px-2 py-1 text-xs text-muted">{{ t('dock.changes.history.failed') }}</p>
            <GitFileList
              v-else
              :files="listOf(commit.sha)"
              :inline="!side"
              :expanded="openedIn(commit.sha)"
              :active="activeIn(commit.sha)"
              @select="openFile(commit, $event)"
              @pin="openFile(commit, $event, true)"
            >
              <template #detail="{ file }">
                <GitDiffBody :state="inlineDiffs.get(commitKey(commit.sha, file.path))" :binary="file.binary" />
              </template>
            </GitFileList>
          </div>
        </li>
        <li v-if="next !== null" :key="`${commits.length}:${next}`" ref="sentinel" class="flex h-8 items-center justify-center" aria-hidden="true">
          <LoaderCircle v-if="busy" class="size-3.5 animate-spin text-muted motion-reduce:animate-none" />
        </li>
      </ol>
    </template>
  </div>
</template>
