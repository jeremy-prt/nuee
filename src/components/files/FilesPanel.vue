<script setup lang="ts">
import { CircleAlert, CollapseAll, FilePlus, FolderPlus, FolderTree, FolderX, Search } from '@/components/ui/icons'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesEditorPane from '@/components/files/FilesEditorPane.vue'
import FilesSearch from '@/components/files/FilesSearch.vue'
import FilesTree from '@/components/files/FilesTree.vue'
import ShellDockToolbar from '@/components/shell/ShellDockToolbar.vue'
import ShellDockToolbarButton from '@/components/shell/ShellDockToolbarButton.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useDockEditor } from '@/composables/useDockEditor'
import { useSlow } from '@/composables/useSlow'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { isAppError } from '@/ipc/agent'
import { filesDir, filesMarks, filesUnwatch, filesWatch } from '@/ipc/files'
import { EXPLORER, parentOf, useFilesStore } from '@/stores/files'
import { useProjectsStore } from '@/stores/projects'

// Volet Explorateur, comme monocode : l'arborescence du dossier de la session (worktree compris) à droite, les
// fichiers ouverts à sa gauche. Le dossier est surveillé tant que le volet est affiché : ce que l'agent ou un
// terminal y change apparaît seul.
const { t } = useI18n()
const { chat } = useTerminalChat()
const projects = useProjectsStore()
const store = useFilesStore()

const path = computed(() => projects.byId(chat.value?.projectId ?? null)?.path ?? null)
// Worktree rejoint avant le premier message : Rust ne le connaît pas encore en base.
const place = computed<FilesPlace>(() => ({
  chatId: chat.value?.id ?? '',
  path: path.value,
  worktree: chat.value?.worktree ? chat.value.worktreePath : null,
}))
const browse = computed(() => (chat.value ? store.of(chat.value.id) : null))
const failure = ref<{ missing: boolean; detail: string } | null>(null)
const root = computed(() => browse.value?.root ?? null)
const rootName = computed(() => {
  const value = root.value?.replace(/[\\/]+$/, '') ?? ''
  return value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1)
})
const blank = computed(() => !chat.value || (!path.value && !chat.value.started))
const editorShown = computed(() => !!browse.value?.tabs.length && !!root.value)
const { area, listWidth: explorerWidth, track } = useDockEditor('files')
// La racine lue une fois reste en mémoire : seule la toute première lecture montre le squelette.
const slowRoot = useSlow(() => !blank.value && !root.value && !failure.value)
track(() => editorShown.value)

// ===== Lecture =====
// Comme monocode : seuls la racine et les dossiers ouverts sont lus, et gardés pour réafficher l'arbre aussitôt.
let generation = 0
async function loadDir(dir: string) {
  const view = browse.value
  if (!view || blank.value) return
  const id = generation
  try {
    const listed = await filesDir(place.value, dir)
    if (id !== generation) return
    view.root = listed.root
    view.dirs.set(dir, listed.entries)
    if (!dir) failure.value = null
  } catch (error) {
    if (id !== generation) return
    if (dir) view.dirs.delete(dir)
    else {
      const detail = isAppError(error) ? error.message : String(error)
      failure.value = { missing: detail.startsWith('dossier introuvable'), detail }
    }
  }
}

async function loadMarks() {
  const view = browse.value
  if (!view || blank.value) return
  const id = generation
  try {
    const marks = await filesMarks(place.value)
    if (id === generation) view.marks = new Map(marks.map((item) => [item.path, item.mark]))
  } catch {
    // Couleurs git en moins, l'arbre reste juste.
  }
}

// Relit la racine et les dossiers ouverts ; un dossier replié est oublié, il sera relu à sa prochaine ouverture.
function refresh() {
  const view = browse.value
  if (!view) return
  for (const dir of view.dirs.keys()) if (dir && !view.expanded.has(dir)) view.dirs.delete(dir)
  const dirs = new Set(['', ...view.expanded])
  for (const dir of dirs) loadDir(dir)
  loadMarks()
}

watch(
  () => (blank.value ? null : `${chat.value?.id}|${JSON.stringify(place.value)}`),
  (key, before) => {
    generation++
    failure.value = null
    const view = browse.value
    // Autre dossier pour la même session (worktree rejoint) : l'ancien arbre ne vaut plus.
    if (view && before && key && before.split('|')[0] === key.split('|')[0]) {
      view.dirs.clear()
      view.root = null
    }
    if (key) refresh()
  },
  { immediate: true },
)
watch(() => browse.value?.disk, refresh)
watch(
  () => [...(browse.value?.expanded ?? [])],
  (dirs) => {
    for (const dir of dirs) if (!browse.value?.dirs.has(dir)) loadDir(dir)
  },
)

// ===== Surveillance =====
let watching: Promise<number | null> = Promise.resolve(null)
function unwatch() {
  const previous = watching
  watching = Promise.resolve(null)
  previous.then((id) => {
    if (id !== null) filesUnwatch(id).catch(() => {})
  })
}
watch(
  () => (blank.value ? null : JSON.stringify(place.value)),
  (key) => {
    unwatch()
    if (!key) return
    const target = place.value
    watching = filesWatch(target, () => store.of(target.chatId).disk++).catch(() => null)
  },
  { immediate: true },
)
onBeforeUnmount(unwatch)

// Trait de la poignée sous la ligne d'outils seulement, au repos comme allumée (survol, glisser, focus).
const belowToolbar = [
  '[background:linear-gradient(transparent_36px,var(--color-stroke)_36px)]!',
  'hover:[background:linear-gradient(transparent_36px,var(--color-edge-hover)_36px)]! hover:shadow-none!',
  'active:[background:linear-gradient(transparent_36px,var(--color-edge-hover)_36px)]! active:shadow-none!',
  'focus-visible:[background:linear-gradient(transparent_36px,var(--color-ring)_36px)]! focus-visible:shadow-none!',
].join(' ')

// ===== Barre =====
// Fermée par son bouton, la recherche se replie avant de disparaître.
const search = useTemplateRef('search')
function toggleSearch() {
  const view = browse.value
  if (!view) return
  if (view.searching) search.value?.close()
  else view.searching = true
}

// Dans le dossier choisi, sinon celui du fichier choisi, sinon à la racine.
function create(dir: boolean) {
  const view = browse.value
  if (!view) return
  const selected = view.selected
  const folder = selected === null ? '' : view.selectedFolder ? selected : parentOf(selected)
  view.searching = false
  view.rootOpen = true
  if (folder) view.expanded.add(folder)
  view.editing = { kind: 'create', parent: folder, dir }
}
</script>

<template>
  <UiEmpty v-if="blank" :icon="FolderTree" :title="t('dock.files.emptyTitle')" :description="t('dock.files.empty')" />
  <div v-else-if="chat && browse" ref="area" class="flex min-h-0 flex-1">
    <template v-if="editorShown && root">
      <FilesEditorPane :place="place" :root="root" class="min-w-0 flex-1" />
      <!-- Un seul fichier : pas de trait dans la barre de titre, donc pas dans la ligne d'outils non plus (demande de Jérémy). -->
      <ShellResizeHandle
        v-model="explorerWidth"
        v-bind="EXPLORER"
        orientation="vertical"
        invert
        :label="t('dock.files.resize')"
        :class="{ [belowToolbar]: browse.tabs.length < 2 }"
        data-explorer-handle
      />
    </template>
    <section
      class="flex min-h-0 flex-col"
      :class="editorShown ? 'shrink-0' : 'min-w-0 flex-1'"
      :style="editorShown ? { width: `${explorerWidth}px` } : undefined"
      :aria-label="t('dock.files.title')"
    >
      <ShellDockToolbar :label="t('dock.files.title')">
        <template #end>
          <ShellDockToolbarButton :label="t('dock.files.newFile')" :disabled="!root || !!failure" @mousedown.prevent @click="create(false)">
            <FilePlus class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.files.newFolder')" :disabled="!root || !!failure" @mousedown.prevent @click="create(true)">
            <FolderPlus class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.files.collapse')" :disabled="!browse.expanded.size || !!failure" @mousedown.prevent @click="browse.expanded.clear()">
            <CollapseAll class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.files.search')" :pressed="browse.searching" :disabled="!root || !!failure" @click="toggleSearch">
            <Search class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
        </template>
      </ShellDockToolbar>
      <UiEmpty
        v-if="failure"
        tone="danger"
        :icon="failure.missing ? FolderX : CircleAlert"
        :title="t(failure.missing ? 'dock.files.folderMissingTitle' : 'dock.files.folderUnreadableTitle')"
        :description="failure.missing ? t('dock.files.folderMissing', { path: place.worktree ?? place.path ?? '' }) : failure.detail"
      />
      <UiSkeleton v-else-if="slowRoot" :label="t('dock.files.loading')" :rows="10" />
      <FilesSearch v-else-if="root" ref="search" :place="place" :active="browse.searching" @close="browse.searching = false">
        <FilesTree :place="place" :root="root" :root-name="rootName" />
      </FilesSearch>
    </section>
  </div>
</template>
