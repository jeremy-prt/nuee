<script setup lang="ts">
import { ChevronDown, ChevronRight, GitCommit, X } from '@/components/ui/icons'
import { computed, inject, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import GitDiffBody from '@/components/git/GitDiffBody.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { type DiffState, GIT_CHANGES } from '@/composables/useGitChanges'
import { worktreeCommitDiff } from '@/ipc/worktree'
import { type DiffTab, useGitPanelStore } from '@/stores/gitPanel'
import { useLayoutStore } from '@/stores/layout'
import { changeStarts, diffLines } from '@/utils/diff'

// Diffs ouverts à gauche de la liste du volet Git, comme l'éditeur de l'Explorateur : leurs onglets montent dans la
// barre de titre, dessous une ligne d'outils (chemin, +x −y, passage d'un changement au suivant), puis le diff. Un
// fichier non commité garde ses commentaires de lignes ; celui d'un commit se lit seulement.
const { t } = useI18n()
const changes = inject(GIT_CHANGES)!
const gitPanel = useGitPanelStore()
const layout = useLayoutStore()
const inBar = computed(() => layout.spans('changes'))

const chatId = computed(() => changes.chat.value?.id ?? '')
const view = computed(() => gitPanel.of(chatId.value))
const tab = computed(() => view.value.tabs.find((item) => item.key === view.value.open) ?? null)
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// Diffs des commits, lus une fois : un commit ne change pas.
const commitDiffs = reactive(new Map<string, DiffState>())
async function loadCommit(item: Extract<DiffTab, { kind: 'commit' }>) {
  const path = changes.project.value?.path
  if (!path || commitDiffs.has(item.key)) return
  commitDiffs.set(item.key, 'loading')
  try {
    commitDiffs.set(item.key, await worktreeCommitDiff(chatId.value, path, item.sha, item.path))
  } catch {
    commitDiffs.set(item.key, 'failed')
  }
}
watch(
  tab,
  (item) => {
    if (item?.kind === 'commit') loadCommit(item)
    else if (item) changes.ensureDiff(item.path)
  },
  { immediate: true },
)
watch(
  () => view.value.tabs.map((item) => item.key),
  (keys) => {
    for (const key of [...commitDiffs.keys()]) if (!keys.includes(key)) commitDiffs.delete(key)
  },
)

const state = computed<DiffState | undefined>(() => {
  const item = tab.value
  if (!item) return undefined
  return item.kind === 'commit' ? commitDiffs.get(item.key) : changes.diffs.get(item.path)
})
const binary = computed(() => {
  const item = tab.value
  return item?.kind === 'work' ? !!changes.files.value.find((file) => file.path === item.path)?.binary : false
})
const lines = computed(() => (typeof state.value === 'object' ? diffLines(state.value.patch) : []))
const stat = computed(() => ({
  added: lines.value.filter((line) => line.kind === 'add').length,
  removed: lines.value.filter((line) => line.kind === 'del').length,
}))
const total = computed(() => changeStarts(lines.value).length)

// Changement montré, comme monocode : « 1/7 » et ses flèches.
const index = ref(0)
watch(() => tab.value?.key, () => (index.value = 0))
const body = useTemplateRef('body')
function step(by: number) {
  const next = Math.min(total.value - 1, Math.max(0, index.value + by))
  index.value = next
  body.value?.querySelector<HTMLElement>(`[data-change="${next}"]`)?.scrollIntoView({ block: 'center' })
}

const crumbs = computed(() => {
  const item = tab.value
  if (!item) return []
  const parts = item.path.split('/')
  return parts.map((label, at) => ({ label, last: at === parts.length - 1 }))
})

function onAuxClick(event: MouseEvent, key: string) {
  if (event.button === 1) gitPanel.closeDiff(chatId.value, key)
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <Teleport defer to="#dock-editor-tabs" :disabled="!inBar">
      <div
        class="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto"
        :class="inBar ? 'h-full min-w-0 flex-1' : 'h-9 shrink-0 border-b border-stroke ps-1.5 pe-2.5'"
        role="tablist"
        :aria-label="t('dock.changes.diffTabs')"
      >
        <div v-for="item in view.tabs" :key="item.key" class="group/tab relative w-44 min-w-24 shrink">
          <button
            type="button"
            role="tab"
            class="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            :class="view.open === item.key ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
            :aria-selected="view.open === item.key"
            :title="item.kind === 'commit' ? `${item.short} · ${item.path}` : item.path"
            @click="view.open = item.key"
            @dblclick="gitPanel.pin(chatId, item.key)"
            @auxclick="onAuxClick($event, item.key)"
          >
            <UiFileIcon :name="nameOf(item.path)" class="size-3.5 shrink-0" />
            <span class="min-w-0 truncate" :class="{ italic: view.preview === item.key }">{{ nameOf(item.path) }}</span>
            <span v-if="item.kind === 'commit'" class="shrink-0 font-mono text-[10px] text-muted">{{ item.short }}</span>
          </button>
          <button
            type="button"
            class="absolute end-1 top-1 grid size-5 place-items-center rounded text-muted hover:bg-selection-inner hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            :class="view.open === item.key ? '' : 'opacity-0 group-hover/tab:opacity-100'"
            :aria-label="t('dock.changes.closeDiff', { name: nameOf(item.path) })"
            @click="gitPanel.closeDiff(chatId, item.key)"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Teleport>

    <template v-if="tab">
      <!-- À la hauteur de la ligne d'outils de la liste : chemin, total du fichier, passage d'un changement à l'autre. -->
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-stroke ps-2.5 pe-1.5 text-xs text-muted">
        <nav class="flex min-w-0 flex-1" :aria-label="t('dock.files.location')">
          <!-- Les dossiers cèdent leur place avant le nom du fichier, coupé seulement en dernier recours. Leur facteur
               énorme laisse au nom moins d'un pixel à céder, sinon son point de suspension apparaît trop tôt. -->
          <ol class="flex min-w-0 items-center overflow-hidden">
            <li v-if="tab.kind === 'commit'" class="flex shrink-0 items-center gap-1 pe-0.5">
              <GitCommit class="size-3.5" aria-hidden="true" />
              <span class="font-mono">{{ tab.short }}</span>
            </li>
            <li v-for="(item, at) in crumbs" :key="at" class="flex items-center" :class="item.last ? 'min-w-0' : 'min-w-6 shrink-[100000]'">
              <ChevronRight v-if="at || tab.kind === 'commit'" class="size-3 shrink-0 opacity-60" aria-hidden="true" />
              <span class="min-w-0 truncate px-0.5" :class="{ 'text-content': item.last }" :aria-current="item.last ? 'page' : undefined">{{ item.label }}</span>
            </li>
          </ol>
        </nav>
        <ChatDiffStat :added="stat.added" :removed="stat.removed" plain />
        <div class="flex shrink-0 items-center" role="group" :aria-label="t('dock.changes.changeOf', { n: total ? index + 1 : 0, total })">
          <UiIconButton :label="t('dock.changes.previousChange')" class="size-6!" :disabled="index <= 0" @click="step(-1)">
            <ChevronDown class="size-3.5 rotate-180" aria-hidden="true" />
          </UiIconButton>
          <span class="min-w-9 text-center font-mono text-[11px] tabular-nums" aria-hidden="true">{{ total ? index + 1 : 0 }}/{{ total }}</span>
          <UiIconButton :label="t('dock.changes.nextChange')" class="size-6!" :disabled="index >= total - 1" @click="step(1)">
            <ChevronDown class="size-3.5" aria-hidden="true" />
          </UiIconButton>
        </div>
      </div>
      <div ref="body" class="flex min-h-0 flex-1 flex-col">
        <GitDiffBody
          :key="tab.key"
          :state="state"
          :binary="binary"
          flush
          :comments="tab.kind === 'work' ? changes.commentsOf(tab.path) : undefined"
          @add="tab.kind === 'work' && changes.addComment(tab.path, $event)"
          @remove="changes.removeComment($event)"
        />
      </div>
    </template>
  </div>
</template>
