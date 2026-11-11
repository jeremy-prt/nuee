<script setup lang="ts">
import { CircleAlert, CollapseAll, FilePlus, FolderPlus, FolderTree, FolderX, Search } from '@/components/ui/icons'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesEditorPane from '@/components/files/FilesEditorPane.vue'
import FilesSearch from '@/components/files/FilesSearch.vue'
import FilesTree from '@/components/files/FilesTree.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { isAppError } from '@/ipc/agent'
import { filesDir, filesMarks, filesUnwatch, filesWatch } from '@/ipc/files'
import { EXPLORER, parentOf, useFilesStore } from '@/stores/files'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'

// Volet Explorateur, comme monocode : l'arborescence du dossier de la session (worktree compris) à droite, les
// fichiers ouverts à sa gauche. Le dossier est surveillé tant que le volet est affiché : ce que l'agent ou un
// terminal y change apparaît seul.
const { t } = useI18n()
const { chat } = useTerminalChat()
const projects = useProjectsStore()
const store = useFilesStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()

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
// Largeur de la zone du volet : tout le panneau, ou sa part quand il est partagé en deux.
const area = useTemplateRef('area')
const areaWidth = ref<number | null>(null)
const resize = new ResizeObserver(([entry]) => (areaWidth.value = entry ? Math.round(entry.contentRect.width) : null))
watch(area, (element, before) => {
  if (before) resize.unobserve(before)
  if (element) resize.observe(element)
})
onBeforeUnmount(() => resize.disconnect())
const explorerWidth = computed({
  get: () => store.explorerShown(areaWidth.value ?? layout.right.size),
  set: (width: number) => store.setExplorerWidth(width),
})
const editorShown = computed(() => !!browse.value?.tabs.length && !!root.value)

// Largeur d'un panneau avec fichier ouvert tant qu'elle n'a pas été réglée : de quoi lire du code à côté de l'arbre,
// sans réduire la conversation sous `CONVERSATION_MIN`.
const EDITOR_COMFORT = 520
const CONVERSATION_MIN = 420
function roomy() {
  const wanted = EDITOR_COMFORT + store.explorerWidth + 1
  const center = document.querySelector<HTMLElement>('main.center-card:not(#view-area)')
  return center ? Math.min(wanted, center.clientWidth + layout.right.size - CONVERSATION_MIN) : wanted
}
// Vue des sessions gardée montée sous Réglages : l'aperçu d'un skill y reprend la largeur du panneau simple.
watch(
  () => editorShown.value && navigation.view === 'chats',
  (editing) => layout.setEditing(editing, editing ? roomy() : 0),
  { immediate: true },
)
onBeforeUnmount(() => layout.setEditing(false))

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

// ===== Barre =====
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

const bar = 'flex h-6 flex-1 items-center justify-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <UiEmpty v-if="blank" :icon="FolderTree" :title="t('dock.files.emptyTitle')" :description="t('dock.files.empty')" />
  <div v-else-if="chat && browse" ref="area" class="flex min-h-0 flex-1">
    <template v-if="editorShown && root">
      <FilesEditorPane :place="place" :root="root" class="min-w-0 flex-1" />
      <ShellResizeHandle v-model="explorerWidth" v-bind="EXPLORER" orientation="vertical" invert :label="t('dock.files.resize')" data-explorer-handle />
    </template>
    <section
      class="flex min-h-0 flex-col"
      :class="editorShown ? 'shrink-0' : 'min-w-0 flex-1'"
      :style="editorShown ? { width: `${explorerWidth}px` } : undefined"
      :aria-label="t('dock.files.title')"
    >
      <FilesSearch v-if="browse.searching" :place="place" @close="browse.searching = false" />
      <template v-else>
        <!-- Infobulles en dessous : au-dessus, elles couvraient la barre de titre et ses onglets, et clignotaient au
             passage du pointeur entre le bouton, l'infobulle et la poignée voisine. -->
        <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2" role="toolbar" :aria-label="t('dock.files.title')">
          <UiTooltip :label="t('dock.files.newFile')" side="bottom">
            <button type="button" :class="bar" :aria-label="t('dock.files.newFile')" :disabled="!root || !!failure" @mousedown.prevent @click="create(false)">
              <FilePlus class="size-3.5" aria-hidden="true" />
            </button>
          </UiTooltip>
          <UiTooltip :label="t('dock.files.newFolder')" side="bottom">
            <button type="button" :class="bar" :aria-label="t('dock.files.newFolder')" :disabled="!root || !!failure" @mousedown.prevent @click="create(true)">
              <FolderPlus class="size-3.5" aria-hidden="true" />
            </button>
          </UiTooltip>
          <UiTooltip :label="t('dock.files.collapse')" side="bottom">
            <button type="button" :class="bar" :aria-label="t('dock.files.collapse')" :disabled="!browse.expanded.size || !!failure" @mousedown.prevent @click="browse.expanded.clear()">
              <CollapseAll class="size-3.5" aria-hidden="true" />
            </button>
          </UiTooltip>
          <UiTooltip :label="t('dock.files.search')" side="bottom">
            <button type="button" :class="bar" :aria-label="t('dock.files.search')" :disabled="!root || !!failure" @click="browse.searching = true">
              <Search class="size-3.5" aria-hidden="true" />
            </button>
          </UiTooltip>
        </div>
        <UiEmpty
          v-if="failure"
          :icon="failure.missing ? FolderX : CircleAlert"
          :title="t(failure.missing ? 'dock.files.folderMissingTitle' : 'dock.files.folderUnreadableTitle')"
          :description="failure.missing ? t('dock.files.folderMissing', { path: place.worktree ?? place.path ?? '' }) : failure.detail"
        />
        <FilesTree v-else-if="root" :place="place" :root="root" :root-name="rootName" />
      </template>
    </section>
  </div>
</template>
