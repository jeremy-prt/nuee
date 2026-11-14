<script setup lang="ts">
import { CaseSensitive, CircleAlert, File as FileGlyph, LoaderCircle, Regex, Search, WholeWord } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesIcon from '@/components/files/FilesIcon.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { field, fieldText } from '@/components/ui/field'
import { useDebounced } from '@/composables/useDebounced'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import type { SearchResults } from '@/ipc/bindings/SearchResults'
import { filesList, filesSearch } from '@/ipc/files'
import { parentOf, useFilesStore } from '@/stores/files'
import { motion } from '@/utils/motion'
import { normalize } from '@/utils/search'

// Recherche du volet Explorateur : deux champs qui se déroulent sous la ligne d'outils, sans quitter la page (demande de
// Jérémy). Le nom filtre les fichiers, le texte cherche dans leur contenu (limité aux fichiers que filtre le nom).
// Champs vides, l'arborescence (slot) reste dessous. Un clic ouvre le fichier, à la ligne pour un résultat de contenu.
const props = defineProps<{ place: FilesPlace }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const store = useFilesStore()

const nameQuery = ref('')
const query = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const regex = ref(false)
const searched = useDebounced(query, 200)
const nameSearched = useDebounced(nameQuery, 100)
const results = ref<SearchResults | null>(null)
const loading = ref(false)
const failed = ref(false)
const input = useTemplateRef('input')
const drop = useTemplateRef('drop')
const below = useTemplateRef('below')
// Liste complète, lue seulement ici : l'arbre ne lit que ses dossiers ouverts.
const files = ref<string[]>([])
// Déroulé en transform seulement (les champs se dévoilent, ce qui est dessous glisse) : animer la hauteur relayoutait
// toute l'arborescence à chaque image, d'où les à-coups.
function slide(open: boolean) {
  const height = drop.value?.offsetHeight ?? 0
  const timing = { ...motion(open ? 'open' : 'close'), fill: 'both' as const }
  if (!height || !timing.duration) return Promise.resolve()
  const reveal = [{ clipPath: 'inset(0 0 100% 0)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }]
  const push = [{ transform: `translateY(${-height}px)` }, { transform: 'none' }]
  const order = open ? 'normal' : 'reverse'
  const animations = [drop.value?.animate(reveal, { ...timing, direction: order }), below.value?.animate(push, { ...timing, direction: order })]
  return Promise.all(animations.map((animation) => animation?.finished.catch(() => {})))
}

let closing = false
async function close() {
  if (closing) return
  closing = true
  await slide(false)
  emit('close')
}
defineExpose({ close })

onMounted(async () => {
  input.value?.focus()
  await nextTick()
  slide(true)
  filesList(props.place)
    .then((listed) => (files.value = listed.files))
    .catch(() => {})
})

const nameOf = (file: string) => file.slice(file.lastIndexOf('/') + 1)
const NAMES = 20

const nameNeedle = computed(() => normalize(nameSearched.value).replaceAll(' ', ''))
const nameMatches = (file: string) => {
  const needle = nameNeedle.value
  return !needle || normalize(file).replaceAll(' ', '').includes(needle)
}
// Le nom avant le chemin : « main » trouve d'abord main.ts, puis ce qui est rangé dans un dossier main.
const named = computed(() => {
  const needle = nameNeedle.value
  if (!needle || searched.value) return []
  const byName = (file: string) => normalize(nameOf(file)).replaceAll(' ', '').includes(needle)
  return files.value
    .filter(nameMatches)
    .sort((a, b) => Number(byName(b)) - Number(byName(a)) || nameOf(a).length - nameOf(b).length)
    .sort((a, b) => nameOf(a).length - nameOf(b).length)
    .slice(0, NAMES)
})

const groups = computed(() => {
  const byFile = new Map<string, SearchResults['matches']>()
  for (const match of (results.value?.matches ?? []).filter((item) => nameMatches(item.path))) byFile.set(match.path, [...(byFile.get(match.path) ?? []), match])
  return [...byFile.entries()].map(([path, matches]) => ({ path, matches }))
})

const count = computed(() => groups.value.reduce((sum, group) => sum + group.matches.length, 0))

let request = 0
watch(
  [searched, caseSensitive, wholeWord, regex],
  async () => {
    const id = ++request
    if (!searched.value) {
      results.value = null
      return
    }
    loading.value = true
    try {
      const found = await filesSearch(props.place, {
        query: searched.value,
        caseSensitive: caseSensitive.value,
        wholeWord: wholeWord.value,
        regex: regex.value,
      })
      if (id !== request) return
      results.value = found
      failed.value = false
    } catch {
      if (id !== request) return
      results.value = null
      failed.value = true
    } finally {
      if (id === request) loading.value = false
    }
  },
  { immediate: true },
)

// Premier passage du texte dans la ligne, surligné comme monocode. Une expression refusée par le navigateur ne
// surligne rien.
const pattern = computed(() => {
  if (!searched.value) return null
  const source = regex.value ? searched.value : searched.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(wholeWord.value ? `\\b(?:${source})\\b` : source, caseSensitive.value ? '' : 'i')
  } catch {
    return null
  }
})

function parts(preview: string) {
  const text = preview.trimStart()
  const found = pattern.value?.exec(text)
  if (!found || !found[0]) return { before: text, hit: '', after: '' }
  // Ligne longue : le début est coupé pour que le passage trouvé reste visible.
  const start = Math.max(0, found.index - 24)
  return {
    before: (start ? '…' : '') + text.slice(start, found.index),
    hit: found[0],
    after: text.slice(found.index + found[0].length),
  }
}

function open(path: string, line?: number) {
  store.openFile(props.place.chatId, path, { line })
}

function onKeydown(event: KeyboardEvent, which: 'name' | 'text') {
  const target = which === 'name' ? nameQuery : query
  if (event.key === 'Escape') {
    event.stopPropagation()
    if (target.value) target.value = ''
    else close()
  } else if (event.key === 'Enter') {
    const first = groups.value[0]?.matches[0]
    if (which === 'name' && named.value[0]) open(named.value[0])
    else if (first) open(first.path, first.line)
  }
}

const toggle =
  'grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-selection aria-pressed:text-content'
const row = 'flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-start hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div ref="drop" class="shrink-0">
      <div class="flex flex-col gap-1.5 p-2">
        <label data-control :class="field">
          <FileGlyph class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <input
            ref="input"
            v-model="nameQuery"
            type="text"
            :class="fieldText"
            :placeholder="t('dock.files.namePlaceholder')"
            :aria-label="t('dock.files.namePlaceholder')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            writingsuggestions="false"
            @keydown="onKeydown($event, 'name')"
          />
        </label>
        <label data-control :class="field">
          <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <input
            v-model="query"
            type="text"
            :class="fieldText"
            :placeholder="t('dock.files.searchPlaceholder')"
            :aria-label="t('dock.files.searchPlaceholder')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            writingsuggestions="false"
            @keydown="onKeydown($event, 'text')"
          />
          <span class="-me-1.5 flex shrink-0">
            <UiTooltip :label="t('dock.files.matchCase')">
              <button type="button" :class="toggle" :aria-label="t('dock.files.matchCase')" :aria-pressed="caseSensitive" @click="caseSensitive = !caseSensitive">
                <CaseSensitive class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
            <UiTooltip :label="t('dock.files.wholeWord')">
              <button type="button" :class="toggle" :aria-label="t('dock.files.wholeWord')" :aria-pressed="wholeWord" @click="wholeWord = !wholeWord">
                <WholeWord class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
            <UiTooltip :label="t('dock.files.regex')">
              <button type="button" :class="toggle" :aria-label="t('dock.files.regex')" :aria-pressed="regex" @click="regex = !regex">
                <Regex class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
          </span>
        </label>
        <p v-if="searched" class="flex items-center gap-1.5 px-1 pt-0.5 text-[11px] text-muted" role="status">
          <LoaderCircle v-if="loading" class="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span v-if="failed" class="flex items-center gap-1.5 text-danger">
            <CircleAlert class="size-3" aria-hidden="true" />{{ t('dock.files.searchFailed') }}
          </span>
          <template v-else-if="results">
            {{ t('dock.files.results', { n: count }, count) }}
            <template v-if="results.truncated">{{ t('dock.files.limited') }}</template>
          </template>
        </p>
      </div>
    </div>

    <!-- Coupé à son cadre : ce qui glisse dessous ne passe jamais sur les champs (un fond les cacherait mais doublerait
         celui, translucide, du panneau). -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div ref="below" class="flex min-h-0 flex-1 flex-col">
    <slot v-if="!query.trim() && !nameQuery.trim()" />
    <div v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <section v-if="named.length" class="mb-2" :aria-label="t('dock.files.byName')">
        <h4 class="px-2 pb-1 text-[11px] font-medium text-muted">{{ t('dock.files.byName') }}</h4>
        <button v-for="file in named" :key="file" type="button" :class="row" class="h-7 text-[13px]" :title="file" @click="open(file)">
          <FilesIcon :name="nameOf(file)" />
          <span class="shrink-0 truncate">{{ nameOf(file) }}</span>
          <span class="min-w-0 flex-1 truncate text-[11px] text-muted">{{ parentOf(file) }}</span>
        </button>
      </section>
      <h4 v-if="groups.length" class="px-2 pb-1 text-[11px] font-medium text-muted">{{ t('dock.files.inContent') }}</h4>
      <section v-for="group in groups" :key="group.path" class="mb-1">
        <button type="button" :class="row" class="h-7 text-[13px]" :title="group.path" @click="open(group.path, group.matches[0]?.line)">
          <FilesIcon :name="nameOf(group.path)" />
          <span class="shrink-0 truncate">{{ nameOf(group.path) }}</span>
          <span class="rounded-full bg-signal/15 px-1.5 text-[10px] leading-4 text-signal-text tabular-nums">{{ group.matches.length }}</span>
          <span class="min-w-0 flex-1 truncate text-[10px] text-muted">{{ parentOf(group.path) }}</span>
        </button>
        <button
          v-for="match in group.matches"
          :key="match.line"
          type="button"
          :class="row"
          class="h-6 ps-3 font-mono text-[11px]"
          @click="open(match.path, match.line)"
        >
          <span class="w-7 shrink-0 text-end text-muted tabular-nums">{{ match.line }}</span>
          <!-- Sur une ligne : `whitespace-pre` garderait les espaces du gabarit. -->
          <span class="min-w-0 flex-1 truncate whitespace-pre">{{ parts(match.preview).before }}<mark v-if="parts(match.preview).hit" class="rounded-sm bg-signal/35 text-content">{{ parts(match.preview).hit }}</mark>{{ parts(match.preview).after }}</span>
        </button>
      </section>
    </div>
    </div>
    </div>
  </div>
</template>
