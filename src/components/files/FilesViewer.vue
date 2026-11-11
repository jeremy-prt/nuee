<script lang="ts">
import type { Picture } from '@/components/files/FilesImage.vue'

// Dernière image affichée, gardée d'un fichier à l'autre (le lecteur est recréé à chaque onglet) : la suivante la
// remplace une fois décodée, sans cadre vide entre les deux.
let lastImage: { chatId: string; picture: Picture } | null = null
const lastImageOf = (chatId: string) => (lastImage?.chatId === chatId ? lastImage.picture : null)

// Mêmes extensions que `IMAGES` dans `services/files.rs`.
const RASTER = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i

// Décodée avant d'être posée : l'`<img>` s'affiche aussitôt, dimensions comprises.
async function decode(src: string) {
  const image = new Image()
  image.src = src
  try {
    await image.decode()
    return { width: image.naturalWidth || null, height: image.naturalHeight || null }
  } catch {
    return { width: null, height: null }
  }
}

// Un SVG sans `width` ni `height` n'a pas de taille propre pour WebKit : celle de sa `viewBox`.
function svgSize(text: string) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? ''
  const attribute = (name: string) => Number.parseFloat(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i').exec(tag)?.[1] ?? '')
  const box = /\sviewBox\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim().split(/[\s,]+/).map(Number) ?? []
  const width = attribute('width') || box[2] || 0
  const height = attribute('height') || box[3] || 0
  return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null
}
</script>

<script setup lang="ts">
import { ChevronRight, CircleAlert, File as FileGlyph, LoaderCircle } from '@/components/ui/icons'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import FilesEditor from '@/components/files/FilesEditor.vue'
import FilesImage from '@/components/files/FilesImage.vue'
import FilesMenu from '@/components/files/FilesMenu.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { isAppError } from '@/ipc/agent'
import type { FileContent } from '@/ipc/bindings/FileContent'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { filesRead, filesStat, filesWrite } from '@/ipc/files'
import { parentOf, useFilesStore } from '@/stores/files'

// Enregistré seul peu après la frappe, contre la version lue : si l'agent a réécrit le fichier entre-temps, rien
// n'est écrasé et la ligne d'outils propose les deux versions. Sans frappe en cours, celle du disque est reprise.
const props = defineProps<{ place: FilesPlace; root: string; file: string }>()

const { t } = useI18n()
const store = useFilesStore()
const browse = computed(() => store.of(props.place.chatId))

const SAVE_DELAY = 600
// Lecture plus longue que ça : l'indicateur apparaît. En dessous, il ne ferait que clignoter.
const SLOW_READ = 200

const content = ref<FileContent | null>(null)
const status = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')
const slow = ref(false)
const error = ref('')
// Version du disque sur laquelle porte le texte affiché, et ce texte tel qu'il y est.
let version = ''
const base = ref('')
const draft = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const conflict = ref(false)
const editor = useTemplateRef('editor')

const name = computed(() => props.file.slice(props.file.lastIndexOf('/') + 1))
const folder = computed(() => props.file.slice(0, Math.max(0, props.file.lastIndexOf('/'))))
const text = computed(() => status.value === 'ready' && content.value?.body.kind === 'text')
const markdown = computed(() => /\.(md|mdx|markdown)$/i.test(name.value))
const svg = computed(() => /\.svg$/i.test(name.value))
const previewable = computed(() => content.value?.body.kind === 'text' && (markdown.value || svg.value))
const showPreview = computed(() => previewable.value && store.view === 'preview')
const dirty = computed(() => draft.value !== base.value)
const line = computed(() => (browse.value.goto?.path === props.file ? browse.value.goto.line : undefined))

// En-tête YAML d'un markdown : à part, replié, comme monocode. Sans fermeture, il reste dans le texte.
const parsed = computed(() => {
  const text = draft.value
  const opening = text.match(/^﻿?---[ \t]*\r?\n/)
  if (!markdown.value || !opening) return { properties: null, body: text }
  const rest = text.slice(opening[0].length)
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest)
  if (!closing) return { properties: null, body: text }
  return { properties: rest.slice(0, closing.index).trimEnd(), body: rest.slice(closing.index + closing[0].length) }
})
const svgData = (text: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
const extension = computed(() => (name.value.includes('.') ? name.value.slice(name.value.lastIndexOf('.') + 1).toUpperCase() : ''))

// ===== Image =====
const raster = ref<Picture | null>(null)
const svgPicture = computed<Picture | null>(() => {
  if (!svg.value) return null
  const size = svgSize(draft.value)
  return { src: svgData(draft.value), width: size?.width ?? null, height: size?.height ?? null, bytes: new TextEncoder().encode(draft.value).length, type: 'SVG' }
})
// Pendant la lecture d'une image, la précédente reste affichée (ou un cadre vide de même taille).
const imageLike = computed(() => RASTER.test(name.value) || (svg.value && store.view === 'preview'))
const previous = lastImageOf(props.place.chatId)
const shownPicture = computed(() => {
  if (status.value === 'loading') return imageLike.value ? previous : null
  if (status.value !== 'ready') return null
  if (content.value?.body.kind === 'image') return raster.value
  return showPreview.value && svg.value ? svgPicture.value : null
})

// ===== Fil d'Ariane =====
const rootName = computed(() => {
  const value = props.root.replace(/[\\/]+$/, '')
  return value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1)
})
// À la racine, le nom est déjà dans l'onglet : seul le dossier de la session reste.
const crumbs = computed(() => {
  if (!folder.value) return []
  const parts = props.file.split('/')
  return parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join('/'), last: index === parts.length - 1 }))
})

// Montre le dossier ou le fichier dans l'arborescence, dossiers parents ouverts.
function reveal(path: string) {
  const view = browse.value
  view.searching = false
  view.rootOpen = true
  for (let dir = parentOf(props.file); dir; dir = parentOf(dir)) view.expanded.add(dir)
  view.selected = path
  view.selectedFolder = path !== props.file
}

let timer: ReturnType<typeof setTimeout> | undefined
let savedTimer: ReturnType<typeof setTimeout> | undefined
let request = 0

function textOf(result: FileContent) {
  return result.body.kind === 'text' ? result.body.text : ''
}

let slowTimer: ReturnType<typeof setTimeout> | undefined

async function load() {
  const id = ++request
  clearTimeout(timer)
  clearTimeout(slowTimer)
  status.value = 'loading'
  slow.value = false
  slowTimer = setTimeout(() => (slow.value = true), SLOW_READ)
  conflict.value = false
  try {
    const result = await filesRead(props.place, props.file)
    if (id !== request) return
    if (result.body.kind === 'image') {
      const { data } = result.body
      const payload = data.slice(data.indexOf(',') + 1)
      const bytes = Math.floor((payload.length * 3) / 4) - (payload.match(/=+$/)?.[0].length ?? 0)
      const size = await decode(data)
      if (id !== request) return
      raster.value = { src: data, ...size, bytes, type: extension.value }
    } else if (result.body.kind === 'text' && svg.value && store.view === 'preview') {
      await decode(svgData(result.body.text))
      if (id !== request) return
    }
    content.value = result
    version = result.version
    base.value = draft.value = textOf(result)
    status.value = 'ready'
  } catch (failure) {
    if (id !== request) return
    content.value = null
    error.value = isAppError(failure) ? failure.message : String(failure)
    status.value = 'failed'
  } finally {
    if (id === request) {
      clearTimeout(slowTimer)
      slow.value = false
    }
  }
}

// Texte du disque posé dans l'éditeur ouvert, sans le recréer : le curseur et le défilement restent.
async function takeDisk() {
  const id = request
  try {
    const result = await filesRead(props.place, props.file)
    if (id !== request) return
    content.value = result
    version = result.version
    base.value = draft.value = textOf(result)
    editor.value?.replace(draft.value)
    conflict.value = false
  } catch {
    status.value = 'missing'
  }
}

async function save(force = false) {
  clearTimeout(timer)
  if (saving.value || (!dirty.value && !force) || (conflict.value && !force)) return
  const id = request
  const text = draft.value
  saving.value = true
  saveError.value = ''
  try {
    const result = await filesWrite(props.place, props.file, text, force ? null : version)
    if (id !== request) return
    if (result.conflict) {
      conflict.value = true
      return
    }
    version = result.version
    base.value = text
    conflict.value = false
    saved.value = true
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => (saved.value = false), 1500)
  } catch (failure) {
    if (id === request) saveError.value = isAppError(failure) ? failure.message : String(failure)
  } finally {
    if (id === request) saving.value = false
  }
  if (id === request && dirty.value && !conflict.value) schedule()
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => save(), SAVE_DELAY)
}

function onChange(text: string) {
  draft.value = text
  store.pin(props.place.chatId, props.file)
  if (!conflict.value) schedule()
}

async function check() {
  if (status.value !== 'ready' || saving.value || conflict.value) return
  const id = request
  try {
    const current = await filesStat(props.place, props.file)
    if (id !== request || saving.value) return
    if (current === null) status.value = 'missing'
    else if (current !== version) {
      if (dirty.value) {
        clearTimeout(timer)
        conflict.value = true
      } else if (content.value?.body.kind === 'text') takeDisk()
      else load()
    }
  } catch {
    // Relu au prochain changement signalé.
  }
}

// Fermeture de l'onglet ou du volet : la frappe en attente part tout de suite.
function flush() {
  clearTimeout(timer)
  if (!dirty.value || conflict.value || saving.value) return
  filesWrite(props.place, props.file, draft.value, version).catch(() => {})
}

watch(() => browse.value.disk, check)
onMounted(() => {
  load()
  window.addEventListener('focus', check)
})
onBeforeUnmount(() => {
  if (shownPicture.value && status.value === 'ready') lastImage = { chatId: props.place.chatId, picture: shownPicture.value }
  flush()
  request++
  clearTimeout(savedTimer)
  clearTimeout(slowTimer)
  window.removeEventListener('focus', check)
})

const state = computed(() => {
  if (saveError.value) return t('dock.files.saveFailed')
  if (saving.value || (dirty.value && !conflict.value)) return t('dock.files.saving')
  if (saved.value) return t('dock.files.saved')
  return ''
})

const views = computed(() => [
  { value: 'preview' as const, label: t('dock.files.preview') },
  { value: 'source' as const, label: t('dock.files.source') },
])
const crumb = 'min-w-0 truncate rounded px-0.5 hover:text-content focus-visible:outline-2 focus-visible:outline-ring'
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- Sous les onglets, à la hauteur de la barre d'outils de l'arborescence : chemin, enregistrement, actions. -->
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-stroke ps-2.5 pe-1.5 text-xs text-muted">
      <nav class="flex min-w-0 flex-1" :aria-label="t('dock.files.location')">
        <ol class="flex min-w-0 items-center overflow-hidden">
          <li class="flex min-w-0 items-center" :title="root">
            <span class="min-w-0 truncate px-0.5">{{ rootName }}</span>
          </li>
          <li v-for="item in crumbs" :key="item.path" class="flex min-w-0 items-center" :class="{ 'max-w-[70%] shrink-0': item.last }">
            <ChevronRight class="size-3 shrink-0 opacity-60" aria-hidden="true" />
            <button
              type="button"
              :class="[crumb, { 'text-content': item.last }]"
              :aria-current="item.last ? 'page' : undefined"
              :title="t('dock.files.showInTree', { path: item.path })"
              @click="reveal(item.path)"
            >{{ item.label }}</button>
          </li>
        </ol>
      </nav>
      <template v-if="text && conflict">
        <span class="shrink-0 text-content" role="status">{{ t('dock.files.conflict') }}</span>
        <button type="button" class="shrink-0 text-content underline-offset-2 hover:underline" @click="save(true)">{{ t('dock.files.keepMine') }}</button>
        <button type="button" class="shrink-0 text-content underline-offset-2 hover:underline" @click="takeDisk">{{ t('dock.files.takeDisk') }}</button>
      </template>
      <span v-else-if="text" class="max-w-40 shrink-0 truncate text-[11px]" :class="{ 'text-danger': saveError }" :title="saveError || undefined" aria-live="polite">{{ state }}</span>
      <UiSegmented v-if="previewable" :model-value="store.view" :options="views" :label="t('dock.files.view')" @update:model-value="store.setView" />
      <UiMoreMenu :label="t('dock.files.actions')" tooltip-side="bottom">
        <FilesMenu :place="place" :root="root" :target="{ path: file, folder: false }" />
      </UiMoreMenu>
    </div>
    <FilesImage v-if="shownPicture || (status === 'loading' && imageLike)" :picture="shownPicture" :name="name" :busy="slow" class="min-h-0 flex-1" />
    <template v-else-if="status === 'loading'">
      <p v-if="slow" class="flex items-center gap-1.5 p-3 text-xs text-muted" role="status">
        <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('dock.files.loading') }}
      </p>
    </template>
    <UiEmpty v-else-if="status === 'missing'" :icon="FileGlyph" :title="t('dock.files.missingTitle')" :description="t('dock.files.missing')" />
    <UiEmpty v-else-if="status === 'failed'" :icon="CircleAlert" :title="t('dock.files.readFailed', { name })" :description="error" />
    <template v-else-if="content">
      <UiEmpty v-if="content.body.kind === 'binary'" :icon="FileGlyph" :title="t('dock.files.binaryTitle')" :description="t('dock.files.binary')" />
      <UiEmpty v-else-if="content.body.kind === 'tooLarge'" :icon="FileGlyph" :title="t('dock.files.tooLargeTitle')" :description="t('dock.files.tooLarge')" />
      <div v-else-if="showPreview && markdown" class="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-8">
        <details v-if="parsed.properties !== null" class="group/props mb-6 rounded-lg border border-content/10 bg-content/3">
          <summary class="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs text-muted">
            <ChevronRight class="size-3 group-open/props:rotate-90" aria-hidden="true" />
            {{ t('dock.files.properties') }}
          </summary>
          <pre class="border-t border-stroke px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted select-text">{{ parsed.properties }}</pre>
        </details>
        <ChatMarkdown :text="parsed.body" />
      </div>
      <FilesEditor v-else-if="content.body.kind === 'text'" ref="editor" :text="draft" :name="name" :label="file" :line="line" @change="onChange" />
    </template>
  </div>
</template>
