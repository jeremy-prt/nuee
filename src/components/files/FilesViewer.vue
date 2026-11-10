<script setup lang="ts">
import { ChevronRight, CircleAlert, File as FileGlyph, LoaderCircle } from '@/components/ui/icons'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import FilesEditor from '@/components/files/FilesEditor.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { isAppError } from '@/ipc/agent'
import type { FileContent } from '@/ipc/bindings/FileContent'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { filesRead, filesStat, filesWrite } from '@/ipc/files'
import { useFilesStore } from '@/stores/files'

// Enregistré seul peu après la frappe, contre la version lue : si l'agent a réécrit le fichier entre-temps, rien
// n'est écrasé et le pied de page propose les deux versions. Sans frappe en cours, celle du disque est reprise.
const props = defineProps<{ place: FilesPlace; root: string; file: string }>()

const { t, locale } = useI18n()
const store = useFilesStore()
const browse = computed(() => store.of(props.place.chatId))

const SAVE_DELAY = 600

const content = ref<FileContent | null>(null)
const status = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')
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
const svgSource = computed(() => (svg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.value)}` : ''))

let timer: ReturnType<typeof setTimeout> | undefined
let savedTimer: ReturnType<typeof setTimeout> | undefined
let request = 0

function textOf(result: FileContent) {
  return result.body.kind === 'text' ? result.body.text : ''
}

async function load() {
  const id = ++request
  clearTimeout(timer)
  status.value = 'loading'
  conflict.value = false
  try {
    const result = await filesRead(props.place, props.file)
    if (id !== request) return
    content.value = result
    version = result.version
    base.value = draft.value = textOf(result)
    status.value = 'ready'
  } catch (failure) {
    if (id !== request) return
    content.value = null
    error.value = isAppError(failure) ? failure.message : String(failure)
    status.value = 'failed'
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
  flush()
  request++
  clearTimeout(savedTimer)
  window.removeEventListener('focus', check)
})

// ===== Image =====
const fit = ref(true)
const size = ref<{ width: number; height: number } | null>(null)
const bytes = computed(() => {
  const data = content.value?.body.kind === 'image' ? content.value.body.data : ''
  const payload = data.slice(data.indexOf(',') + 1)
  return Math.floor((payload.length * 3) / 4)
})
const weight = computed(() => {
  const value = bytes.value
  const [amount, unit] = value >= 1024 * 1024 ? [value / 1024 / 1024, 'megabyte'] : [value / 1024, 'kilobyte']
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit, maximumFractionDigits: 1 }).format(amount)
})
function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  size.value = { width: image.naturalWidth, height: image.naturalHeight }
}

const state = computed(() => {
  if (saveError.value) return t('dock.files.saveFailed')
  if (saving.value || (dirty.value && !conflict.value)) return t('dock.files.saving')
  if (saved.value) return t('dock.files.saved')
  return ''
})

const toggle = 'rounded px-2 py-0.5 text-[11px]'
const footer = 'flex h-6 shrink-0 items-center gap-2 border-t border-stroke px-2.5 text-[10.5px] text-muted'
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <p v-if="status === 'loading'" class="flex items-center gap-1.5 p-3 text-xs text-muted">
      <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {{ t('dock.files.loading') }}
    </p>
    <UiEmpty v-else-if="status === 'missing'" :icon="FileGlyph" :title="t('dock.files.missingTitle')" :description="t('dock.files.missing')" />
    <UiEmpty v-else-if="status === 'failed'" :icon="CircleAlert" :title="t('dock.files.readFailed', { name })" :description="error" />
    <template v-else-if="content">
      <!-- Image : fond en damier, un clic passe de l'ajustement à la taille réelle. -->
      <template v-if="content.body.kind === 'image'">
        <!-- Ajustée en position absolue : dans une grille sans hauteur fixée, `max-h-full` la réduisait à rien. -->
        <button
          type="button"
          class="files-checker relative min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          :aria-label="fit ? t('dock.files.actualSize') : t('dock.files.fitSize')"
          @click="fit = !fit"
        >
          <img
            :src="content.body.data"
            :alt="name"
            :class="fit ? 'absolute inset-4 m-auto max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain' : 'm-4 max-w-none'"
            @load="onImageLoad"
          />
        </button>
        <footer :class="footer">
          <span v-if="size" class="tabular-nums">{{ size.width }} × {{ size.height }}</span>
          <span>{{ weight }}</span>
          <span class="flex-1" />
          <span>{{ fit ? t('dock.files.fitted') : '100 %' }}</span>
        </footer>
      </template>
      <UiEmpty v-else-if="content.body.kind === 'binary'" :icon="FileGlyph" :title="t('dock.files.binaryTitle')" :description="t('dock.files.binary')" />
      <UiEmpty v-else-if="content.body.kind === 'tooLarge'" :icon="FileGlyph" :title="t('dock.files.tooLargeTitle')" :description="t('dock.files.tooLarge')" />
      <template v-else>
        <div class="relative flex min-h-0 flex-1 flex-col">
          <div
            v-if="previewable"
            class="absolute end-2 top-2 z-20 flex rounded-md border border-content/10 bg-content/10 p-0.5 backdrop-blur-md"
            role="radiogroup"
            :aria-label="t('dock.files.view')"
          >
            <button
              type="button"
              role="radio"
              :class="[toggle, store.view === 'preview' ? 'bg-selection text-content' : 'text-muted hover:text-content']"
              :aria-checked="store.view === 'preview'"
              @click="store.setView('preview')"
            >{{ t('dock.files.preview') }}</button>
            <button
              type="button"
              role="radio"
              :class="[toggle, store.view === 'source' ? 'bg-selection text-content' : 'text-muted hover:text-content']"
              :aria-checked="store.view === 'source'"
              @click="store.setView('source')"
            >{{ t('dock.files.source') }}</button>
          </div>
          <div v-if="showPreview && markdown" class="min-h-0 flex-1 overflow-y-auto px-6 pt-12 pb-8">
            <details v-if="parsed.properties !== null" class="group/props mb-6 rounded-lg border border-content/10 bg-content/3">
              <summary class="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs text-muted">
                <ChevronRight class="size-3 group-open/props:rotate-90" aria-hidden="true" />
                {{ t('dock.files.properties') }}
              </summary>
              <pre class="border-t border-stroke px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted select-text">{{ parsed.properties }}</pre>
            </details>
            <ChatMarkdown :text="parsed.body" />
          </div>
          <div v-else-if="showPreview && svg" class="files-checker relative min-h-0 flex-1">
            <img :src="svgSource" :alt="name" class="absolute inset-4 m-auto max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain" />
          </div>
          <FilesEditor v-else ref="editor" :text="draft" :name="name" :label="file" :line="line" @change="onChange" />
        </div>
        <footer :class="footer" class="font-mono">
          <span class="min-w-0 flex-1 truncate" :title="file">{{ file }}</span>
          <template v-if="conflict">
            <span class="shrink-0 font-sans text-content" role="status">{{ t('dock.files.conflict') }}</span>
            <button type="button" class="shrink-0 font-sans text-content underline-offset-2 hover:underline" @click="save(true)">{{ t('dock.files.keepMine') }}</button>
            <button type="button" class="shrink-0 font-sans text-content underline-offset-2 hover:underline" @click="takeDisk">{{ t('dock.files.takeDisk') }}</button>
          </template>
          <span v-else class="max-w-64 shrink-0 truncate font-sans" :class="{ 'text-danger': saveError }" :title="saveError || undefined" aria-live="polite">{{ state }}</span>
        </footer>
      </template>
    </template>
  </div>
</template>

<style scoped>
.files-checker {
  background-image:
    linear-gradient(45deg, rgb(128 128 128 / 0.1) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(128 128 128 / 0.1) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 0.1) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 0.1) 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}
</style>
