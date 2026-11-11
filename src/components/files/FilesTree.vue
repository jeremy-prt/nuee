<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesIcon from '@/components/files/FilesIcon.vue'
import FilesMenu from '@/components/files/FilesMenu.vue'
import FilesNameField from '@/components/files/FilesNameField.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { isAppError } from '@/ipc/agent'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import type { GitMark } from '@/ipc/bindings/GitMark'
import { filesCreate, filesRename } from '@/ipc/files'
import { type FileTarget, parentOf, useFilesStore } from '@/stores/files'
import { useToastsStore } from '@/stores/toasts'

// Arborescence du dossier de la session, comme l'explorateur de monocode : le dossier en tête, puis ses dossiers et
// ses fichiers, chaque dossier lu à son ouverture (`browse.dirs`, tenu à jour par le panneau). État git en lettre et
// en couleur, comme le volet Git (`GitFileList`) ; un dossier qui contient des changements prend un point.
// Rust confond encore non suivi et ajouté (`GitMark`) : les deux sortent en A.
const props = defineProps<{ place: FilesPlace; root: string; rootName: string }>()

const { t } = useI18n()
const store = useFilesStore()
const toasts = useToastsStore()
const browse = computed(() => store.of(props.place.chatId))

type Row =
  | { kind: 'entry'; key: string; name: string; path: string; depth: number; folder: boolean }
  | { kind: 'input'; key: string; depth: number; dir: boolean }

function flatten(dir: string, depth: number, rows: Row[]) {
  const editing = browse.value.editing
  const creating = editing?.kind === 'create' && editing.parent === dir ? editing : null
  const entries = browse.value.dirs.get(dir) ?? []
  if (creating?.dir) rows.push({ kind: 'input', key: 'input', depth, dir: true })
  for (const entry of entries.filter((item) => item.folder)) {
    rows.push({ kind: 'entry', key: `d:${entry.path}`, name: entry.name, path: entry.path, depth, folder: true })
    if (browse.value.expanded.has(entry.path)) flatten(entry.path, depth + 1, rows)
  }
  if (creating && !creating.dir) rows.push({ kind: 'input', key: 'input', depth, dir: false })
  for (const entry of entries.filter((item) => !item.folder)) {
    rows.push({ kind: 'entry', key: `f:${entry.path}`, name: entry.name, path: entry.path, depth, folder: false })
  }
}

const rows = computed<Row[]>(() => {
  const list: Row[] = []
  if (browse.value.rootOpen) flatten('', 0, list)
  return list
})

const { shown, more, limit, sentinel } = useProgressiveList(rows, () => props.place.chatId)

// Un dossier prend la couleur la plus forte de ce qu'il contient : modifié avant nouveau.
const folderMarks = computed(() => {
  const marks = new Map<string, GitMark>()
  for (const [path, mark] of browse.value.marks) {
    for (let dir = parentOf(path); dir; dir = parentOf(dir)) {
      if (marks.get(dir) === 'modified') break
      marks.set(dir, mark === 'modified' ? 'modified' : (marks.get(dir) ?? mark))
    }
  }
  return marks
})
const LETTER: Record<GitMark, string> = { modified: 'M', added: 'A', renamed: 'R' }
const TONE: Record<GitMark, string> = { modified: 'text-warning', added: 'text-success', renamed: 'text-violet' }
function gitMark(item: Extract<Row, { kind: 'entry' }>) {
  const mark = item.folder ? folderMarks.value.get(item.path) : browse.value.marks.get(item.path)
  if (!mark) return null
  return { tone: TONE[mark], letter: LETTER[mark], label: item.folder ? t('dock.files.folderChanged') : t(`dock.changes.status.${mark}`) }
}

const rootTarget: FileTarget = { path: '', folder: true }

// Volet ouvert par son raccourci : la ligne choisie, sinon la première, une fois le dossier lu.
const scroller = useTemplateRef('scroller')
watch(
  [() => store.wantsFocus, () => browse.value.dirs.has('') || !browse.value.rootOpen],
  async ([wanted, ready]) => {
    if (!wanted || !ready) return
    await nextTick()
    const rows = [...(scroller.value?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
    const row = rows.find((item) => item.dataset.path === browse.value.selected) ?? rows[0]
    ;(row ?? scroller.value?.querySelector<HTMLElement>('button'))?.focus()
    store.wantsFocus = false
  },
  { immediate: true },
)

// Ligne choisie hors de l'arbre (fil d'Ariane, recherche) : amenée à l'écran une fois ses dossiers lus.
let pending: string | null = null
watch(
  () => browse.value.selected,
  (path) => (pending = path),
)
watch([() => browse.value.selected, shown], async () => {
  if (!pending) return
  await nextTick()
  const row = [...(scroller.value?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((item) => item.dataset.path === pending)
  if (!row) return
  pending = null
  row.scrollIntoView({ block: 'nearest' })
})

// Un clic ouvre le fichier en aperçu, un double clic le garde en onglet.
function select(item: Extract<Row, { kind: 'entry' }>) {
  browse.value.selected = item.path
  browse.value.selectedFolder = item.folder
  if (!item.folder) store.openFile(props.place.chatId, item.path)
  else if (!browse.value.expanded.delete(item.path)) browse.value.expanded.add(item.path)
}

function keep(item: Extract<Row, { kind: 'entry' }>) {
  if (!item.folder) store.openFile(props.place.chatId, item.path, { pin: true })
}

function fail(title: string, error: unknown) {
  toasts.push({ kind: 'error', title, body: isAppError(error) ? error.message : String(error) })
}

async function commit(name: string) {
  const editing = browse.value.editing
  browse.value.editing = null
  if (!editing) return
  try {
    if (editing.kind === 'create') {
      const made = await filesCreate(props.place, editing.parent, name, editing.dir)
      if (!editing.dir) store.openFile(props.place.chatId, made, { pin: true })
      browse.value.selected = made
      browse.value.selectedFolder = editing.dir
    } else {
      const renamed = await filesRename(props.place, editing.path, name)
      store.moved(props.place.chatId, editing.path, renamed)
      if (browse.value.expanded.delete(editing.path)) browse.value.expanded.add(renamed)
    }
    browse.value.disk++
  } catch (error) {
    fail(t(editing.kind === 'create' ? 'dock.files.createFailed' : 'dock.files.renameFailed'), error)
  }
}

// Flèches comme dans un explorateur : ↑ ↓ d'une ligne à l'autre, → déplie, ← replie ou remonte au dossier parent.
function onKeydown(event: KeyboardEvent) {
  const current = event.target as HTMLElement
  if (current.getAttribute('role') !== 'treeitem') return
  const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="treeitem"]')]
  const index = items.indexOf(current)
  const path = current.dataset.path ?? ''
  const folder = current.dataset.folder === 'true'
  const expanded = browse.value.expanded
  let next: HTMLElement | undefined
  if (event.key === 'ArrowDown') next = items[index + 1]
  else if (event.key === 'ArrowUp') next = items[index - 1]
  else if (event.key === 'ArrowRight' && folder && !expanded.has(path)) expanded.add(path)
  else if (event.key === 'ArrowLeft' && folder && expanded.has(path)) expanded.delete(path)
  else if (event.key === 'ArrowLeft') next = items.find((item) => item.dataset.path === parentOf(path))
  else return
  event.preventDefault()
  next?.focus()
}

const renaming = (path: string) => browse.value.editing?.kind === 'rename' && browse.value.editing.path === path
const indent = (depth: number) => ({ paddingInlineStart: `${8 + depth * 12}px` })

const row =
  'flex h-7.5 w-full min-w-0 items-center gap-1 rounded-md pe-2 text-start text-[13px] hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <UiContextMenu class="flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
      <button
        type="button"
        :class="row"
        class="h-8! shrink-0 ps-2 font-medium text-muted"
        :aria-expanded="browse.rootOpen"
        :title="root"
        @click="browse.rootOpen = !browse.rootOpen"
      >
        <ChevronRight class="size-3.5 shrink-0" :class="{ 'rotate-90': browse.rootOpen }" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ rootName }}</span>
      </button>
      <ul class="flex flex-col gap-0.5" role="tree" :aria-label="rootName" @keydown="onKeydown">
        <li v-for="item in shown" :key="item.key" role="none">
          <div v-if="item.kind === 'input'" class="flex h-7.5 items-center gap-1 pe-2" :style="indent(item.depth)">
            <span class="size-3.5 shrink-0" />
            <FilesIcon name="" :folder="item.dir" />
            <FilesNameField :label="t(item.dir ? 'dock.files.newFolder' : 'dock.files.newFile')" @commit="commit" @cancel="browse.editing = null" />
          </div>
          <div v-else-if="renaming(item.path)" class="flex h-7.5 items-center gap-1 pe-2" :style="indent(item.depth)">
            <span class="size-3.5 shrink-0" />
            <FilesIcon :name="item.name" :folder="item.folder" :open="browse.expanded.has(item.path)" />
            <FilesNameField :initial="item.name" :label="t('dock.files.rename')" @commit="commit" @cancel="browse.editing = null" />
          </div>
          <UiContextMenu v-else @contextmenu.stop>
            <button
              type="button"
              role="treeitem"
              :data-path="item.path"
              :data-folder="item.folder"
              :class="[row, { 'bg-selection hover:bg-selection': browse.selected === item.path }]"
              :style="indent(item.depth)"
              :aria-expanded="item.folder ? browse.expanded.has(item.path) : undefined"
              :aria-selected="browse.selected === item.path"
              :title="item.path"
              @click="select(item)"
              @dblclick="keep(item)"
            >
              <ChevronRight
                v-if="item.folder"
                class="size-3.5 shrink-0 text-muted"
                :class="{ 'rotate-90': browse.expanded.has(item.path) }"
                aria-hidden="true"
              />
              <span v-else class="size-3.5 shrink-0" />
              <FilesIcon :name="item.name" :folder="item.folder" :open="browse.expanded.has(item.path)" />
              <span class="max-w-full min-w-0 truncate" :class="gitMark(item)?.tone">{{ item.name }}</span>
              <template v-if="gitMark(item)">
                <span class="sr-only">{{ gitMark(item)?.label }}</span>
                <span v-if="item.folder" class="ms-auto me-1 size-1.5 shrink-0 rounded-full bg-current" :class="gitMark(item)?.tone" aria-hidden="true" />
                <span v-else class="ms-auto w-3 shrink-0 text-center font-mono text-[11px] font-medium" :class="gitMark(item)?.tone" aria-hidden="true">
                  {{ gitMark(item)?.letter }}
                </span>
              </template>
            </button>
            <template #menu>
              <FilesMenu :place="place" :root="root" :target="{ path: item.path, folder: item.folder }" />
            </template>
          </UiContextMenu>
        </li>
        <li v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
      </ul>
      <div class="min-h-6 flex-1" />
    </div>
    <template #menu>
      <FilesMenu :place="place" :root="root" :target="rootTarget" />
    </template>
  </UiContextMenu>
</template>
