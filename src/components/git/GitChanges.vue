<script setup lang="ts">
import { GitBranchPlus, RefreshCw, Undo } from '@/components/ui/icons'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatGitRun from '@/components/chat/ChatGitRun.vue'
import GitBranchRow from '@/components/git/GitBranchRow.vue'
import GitCommitBox from '@/components/git/GitCommitBox.vue'
import GitDiffBody from '@/components/git/GitDiffBody.vue'
import GitFileList from '@/components/git/GitFileList.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useGitActions } from '@/composables/useGitActions'
import { GIT_CHANGES } from '@/composables/useGitChanges'
import { useSlow } from '@/composables/useSlow'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangedFiles } from '@/ipc/bindings/ChangedFiles'
import { useGitPanelStore, workKey } from '@/stores/gitPanel'
import { useLayoutStore } from '@/stores/layout'
import { useToastsStore } from '@/stores/toasts'

// Mode Changements du volet Git, comme monocode : la branche, les fichiers non commités, puis le champ et le bouton
// de commit en bas. `side` : un clic ouvre le diff à gauche de la liste ; sinon (panneau étroit ou partagé) il se déplie sous
// la ligne.
const props = defineProps<{ side: boolean }>()

const { t } = useI18n()
const changes = inject(GIT_CHANGES)!
const { chat, files, status, readOnly } = changes
const { run, initRepo, start } = useGitActions()
const gitPanel = useGitPanelStore()
const layout = useLayoutStore()
const toasts = useToastsStore()
const slowList = useSlow(() => status.value === 'loading' && !files.value.length)

async function refresh() {
  await changes.refresh()
  toasts.push({ title: t('feedback.listRefreshed'), body: t('dock.session.files', { n: files.value.length }, files.value.length) })
}

const view = computed(() => (chat.value ? gitPanel.of(chat.value.id) : null))
const active = computed(() => {
  const open = view.value?.tabs.find((tab) => tab.key === view.value?.open)
  return props.side && open?.kind === 'work' ? open.path : null
})

function select(file: ChangedFile, pin = false) {
  if (!chat.value) return
  if (!props.side) {
    if (!pin) changes.toggle(file)
    return
  }
  gitPanel.openDiff(chat.value.id, { kind: 'work', key: workKey(file.path), path: file.path }, pin)
  changes.ensureDiff(file.path)
}

// ===== Fichier à montrer, focus au clavier =====

const list = ref<HTMLElement | null>(null)

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
  if (!focus || changes.loading.value || !changes.listing.value) return
  layout.changesFocus = null
  const file = match(focus, changes.listing.value)
  if (!file) return
  if (props.side || !changes.opened.has(file.path)) select(file, true)
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-change="${CSS.escape(file.path)}"]`)?.scrollIntoView({ block: 'nearest' })
}
watch([() => layout.changesFocus, () => changes.loading.value], applyFocus, { immediate: true })

async function takeFocus() {
  if (!layout.changesWantsFocus || changes.loading.value) return
  layout.changesWantsFocus = false
  await nextTick()
  list.value?.querySelector<HTMLElement>('[data-change] button')?.focus()
}
watch([() => layout.changesWantsFocus, () => changes.loading.value], takeFocus, { immediate: true })

const note = 'px-3 py-6 text-center text-xs text-muted'
</script>

<template>
  <div class="@container flex min-h-0 flex-1 flex-col">
    <p v-if="!changes.project.value" :class="note">{{ t('dock.changes.noProject') }}</p>
    <p v-else-if="changes.pending.value" :class="note">{{ t('dock.changes.pending') }}</p>
    <div v-else-if="status === 'notRepo'" class="flex flex-col items-center gap-3 px-3 py-6 text-center text-xs text-muted">
      <p>{{ t('dock.changes.notRepo') }}</p>
      <div data-git-run="changes" class="flex w-full justify-center">
        <ChatGitRun v-if="run" :run="run" />
        <UiTooltip v-else :label="t('dock.changes.readOnly')" :disabled="!readOnly">
          <span class="flex">
            <button
              type="button"
              class="flex h-7 items-center gap-1.5 rounded-md border border-stroke px-2.5 text-xs text-content enabled:hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
              data-control
              :disabled="readOnly"
              @click="start('initRepo', $event.detail === 0, '[data-git-run=changes] [data-git-stop]')"
            >
              <GitBranchPlus class="size-3.5" aria-hidden="true" />
              {{ initRepo.label }}
            </button>
          </span>
        </UiTooltip>
      </div>
    </div>
    <p v-else-if="status === 'failed'" :class="[note, 'text-danger!']" role="alert">{{ t('dock.changes.failed') }}</p>
    <template v-else>
      <div class="flex shrink-0 flex-col gap-1.5 border-b border-stroke p-2">
        <GitBranchRow>
          <span v-if="files.length" class="flex shrink-0 items-center gap-1.5 text-[11px] text-muted tabular-nums" :title="t('dock.session.files', { n: files.length }, files.length)">
            <span class="sr-only">{{ t('dock.session.files', { n: files.length }, files.length) }}</span>
            <span aria-hidden="true">{{ files.length }}</span>
          </span>
          <span class="-me-1 flex shrink-0 items-center">
            <UiIconButton :label="t('dock.changes.revertAll')" :disabled="!files.length || changes.acting.value" class="size-6!" @click="changes.revertAll()">
              <Undo class="size-3" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton :label="t('dock.changes.refresh')" :loading="changes.loading.value" class="size-6!" @click="refresh">
              <RefreshCw class="size-3" aria-hidden="true" />
            </UiIconButton>
          </span>
        </GitBranchRow>
      </div>

      <div ref="list" class="min-h-0 flex-1 overflow-y-auto p-2">
        <UiSkeleton v-if="slowList" :label="t('dock.files.loading')" :rows="5" class="p-0!" />
        <p v-else-if="status === 'ready' && !files.length" :class="note">{{ t('dock.changes.clean') }}</p>
        <GitFileList
          v-else
          :files="files"
          :inline="!side"
          :expanded="changes.opened"
          :active="active"
          :reset="chat?.id"
          @select="select($event)"
          @pin="select($event, true)"
        >
          <template #actions="{ file }">
            <UiIconButton v-if="!file.path.endsWith('/')" :label="t('dock.changes.revert')" inner class="size-6!" :disabled="changes.acting.value" @click="changes.revert(file)">
              <Undo class="size-3.5 text-danger" aria-hidden="true" />
            </UiIconButton>
          </template>
          <template #detail="{ file }">
            <GitDiffBody
              :state="changes.diffs.get(file.path)"
              :binary="file.binary"
              :comments="readOnly ? undefined : changes.commentsOf(file.path)"
              @add="changes.addComment(file.path, $event)"
              @remove="changes.removeComment($event)"
            />
          </template>
        </GitFileList>
      </div>
      <GitCommitBox class="shrink-0 border-t border-stroke p-2" />
    </template>
  </div>
</template>
