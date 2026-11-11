<script setup lang="ts">
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  Eye,
  FilePlus,
  FolderPlus,
  Link,
  Paperclip,
  Pencil,
  Scissors,
  SquareTerminal,
  Trash2,
} from '@/components/ui/icons'
import { DropdownMenuCheckboxItem } from 'reka-ui'
import { computed, type FunctionalComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesFinderIcon from '@/components/files/FilesFinderIcon.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import { menuIcon, menuLabel, menuRow } from '@/components/ui/menuRow'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { isAppError } from '@/ipc/agent'
import type { EditorApp } from '@/ipc/bindings/EditorApp'
import { filesOpenEditor, filesPaste, filesReveal, filesTrash } from '@/ipc/files'
import { projectReveal } from '@/ipc/project'
import { useDialogStore } from '@/stores/dialog'
import { useDraftsStore } from '@/stores/drafts'
import { type FileTarget, parentOf, useFilesStore } from '@/stores/files'
import { useLayoutStore } from '@/stores/layout'
import { useTerminalsStore } from '@/stores/terminals'
import { useToastsStore } from '@/stores/toasts'

// Menu d'un fichier, d'un dossier ou du dossier de la session (chemin vide), comme l'explorateur de monocode. Posé
// dans le clic droit des lignes et de la zone vide, et dans le « … » de l'aperçu. `root` : dossier de la session.
const props = defineProps<{ place: FilesPlace; root: string; target: FileTarget }>()

const { t } = useI18n()
const drafts = useDraftsStore()
const files = useFilesStore()
const dialog = useDialogStore()
const layout = useLayoutStore()
const terminals = useTerminalsStore()
const toasts = useToastsStore()
files.loadEditors()

// Logo de l'app installée, posé à la place d'une icône de menu (les classes de taille passent par `attrs`).

const logo = (src: string | null): FunctionalComponent | undefined =>
  src ? (_, { attrs }) => h('img', { src, alt: '', draggable: false, ...attrs }) : undefined

const browse = computed(() => files.of(props.place.chatId))
const isRoot = computed(() => !props.target.path)
const name = computed(() => props.target.path.slice(props.target.path.lastIndexOf('/') + 1))
// Dossier où créer ou coller : le dossier visé, sinon celui du fichier.
const folder = computed(() => (props.target.folder ? props.target.path : parentOf(props.target.path)))
const absolute = (relative: string) => (relative ? `${props.root.replace(/[\\/]+$/, '')}/${relative}` : props.root)

const previewable = computed(() => !props.target.folder && /\.(md|mdx|markdown|svg)$/i.test(name.value))
// Un markdown ou un SVG pas encore ouvert n'est pas affiché en source : choisir l'aperçu l'ouvre ainsi.
const previewed = computed(() => previewable.value && files.view === 'preview' && browse.value.tabs.includes(props.target.path))

function togglePreview() {
  if (!browse.value.tabs.includes(props.target.path)) {
    files.openFile(props.place.chatId, props.target.path, { pin: true })
    files.setView('preview')
  } else files.setView(previewed.value ? 'source' : 'preview')
}

const clip = computed(() => (files.clipboard?.chatId === props.place.chatId ? files.clipboard : null))
// Un dossier ne se colle ni dans lui-même ni dans l'un de ses sous-dossiers.
const pasteBlocked = computed(() => {
  const source = clip.value?.target
  if (!source) return true
  return source.folder && (folder.value === source.path || folder.value.startsWith(`${source.path}/`))
})

function fail(title: string, error: unknown) {
  toasts.push({ kind: 'error', title, body: isAppError(error) ? error.message : String(error) })
}

function create(dir: boolean) {
  if (folder.value) browse.value.expanded.add(folder.value)
  browse.value.rootOpen = true
  browse.value.editing = { kind: 'create', parent: folder.value, dir }
}

function hold(cut: boolean) {
  files.clipboard = { chatId: props.place.chatId, target: { ...props.target }, cut }
}

async function paste(source: FileTarget, parent: string, cut: boolean) {
  try {
    const placed = await filesPaste(props.place, source.path, parent, cut)
    if (cut) {
      files.clipboard = null
      files.moved(props.place.chatId, source.path, placed)
    }
    if (parent) browse.value.expanded.add(parent)
    browse.value.selected = placed
    browse.value.selectedFolder = source.folder
    browse.value.disk++
  } catch (error) {
    fail(t('dock.files.pasteFailed'), error)
  }
}

async function remove() {
  const confirmed = await dialog.confirm({
    title: t(props.target.folder ? 'dock.files.deleteFolderTitle' : 'dock.files.deleteTitle', { name: name.value }),
    message: t('dock.files.deleteMessage'),
    confirmLabel: t('dock.files.delete'),
    danger: true,
  })
  if (!confirmed) return
  try {
    await filesTrash(props.place, props.target.path)
    files.moved(props.place.chatId, props.target.path, null)
    browse.value.disk++
  } catch (error) {
    fail(t('dock.files.deleteFailed'), error)
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toasts.push({ kind: 'success', title: t('dock.files.copied'), body: text })
  } catch (error) {
    fail(t('dock.files.copyFailed'), error)
  }
}

async function openIn(editor: EditorApp) {
  try {
    await filesOpenEditor(props.place, props.target.path, editor.id)
  } catch (error) {
    fail(t('dock.files.openFailed', { editor: editor.name }), error)
  }
}

function openTerminal() {
  terminals.create(props.place.chatId, { cwd: absolute(folder.value), worktree: false, worktreePath: null, worktreeBase: null })
  layout.showView('terminal')
  terminals.requestFocus()
}

async function reveal() {
  try {
    if (isRoot.value) await projectReveal(props.root)
    else await filesReveal(props.place, props.target.path)
  } catch (error) {
    fail(t('dock.files.revealFailed'), error)
  }
}
</script>

<template>
  <UiMenuItem :label="t('dock.files.newFile')" :icon="FilePlus" @select="create(false)" />
  <UiMenuItem :label="t('dock.files.newFolder')" :icon="FolderPlus" @select="create(true)" />
  <UiMenuSeparator />
  <UiMenuItem :label="t('dock.files.cut')" :icon="Scissors" :disabled="isRoot" @select="hold(true)" />
  <UiMenuItem :label="t('dock.files.copy')" :icon="Copy" :disabled="isRoot" @select="hold(false)" />
  <UiMenuItem :label="t('dock.files.paste')" :icon="ClipboardPaste" :disabled="pasteBlocked" @select="clip && paste(clip.target, folder, clip.cut)" />
  <UiMenuItem :label="t('dock.files.duplicate')" :icon="CopyPlus" :disabled="isRoot" @select="paste(target, parentOf(target.path), false)" />
  <UiMenuSeparator />
  <UiMenuItem :label="t('dock.files.copyPath')" :icon="Link" @select="copyText(absolute(target.path))" />
  <UiMenuItem :label="t('dock.files.copyRelativePath')" :icon="Link" :disabled="isRoot" @select="copyText(target.path)" />
  <UiMenuSeparator />
  <UiMenuItem :label="t('dock.files.rename')" :icon="Pencil" :disabled="isRoot" @select="browse.editing = { kind: 'rename', path: target.path, folder: target.folder }" />
  <UiMenuItem :label="t('dock.files.delete')" :icon="Trash2" danger :disabled="isRoot" @select="remove" />
  <UiMenuSeparator />
  <DropdownMenuCheckboxItem v-if="previewable" :model-value="previewed" :text-value="t('dock.files.preview')" :class="[menuRow, 'py-1']" @select="togglePreview">
    <Eye :class="menuIcon" aria-hidden="true" />
    <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('dock.files.preview') }}</span>
  </DropdownMenuCheckboxItem>
  <UiMenuItem :label="t('dock.files.attach')" :icon="Paperclip" @select="drafts.requestAttach(place.chatId, [absolute(target.path)])" />
  <UiMenuSub v-if="files.editors?.length" :label="t('dock.files.openWith')" :icon="ExternalLink">
    <UiMenuItem v-for="editor in files.editors" :key="editor.id" :label="editor.name" :icon="logo(editor.icon)" @select="openIn(editor)" />
  </UiMenuSub>
  <UiMenuItem :label="t('dock.files.openTerminal')" :icon="SquareTerminal" @select="openTerminal" />
  <UiMenuItem :label="t('dock.files.reveal')" :icon="FilesFinderIcon" @select="reveal" />
</template>
