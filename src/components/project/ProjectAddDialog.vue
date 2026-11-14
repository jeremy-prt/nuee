<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectAddChoice, { type AddSource } from '@/components/project/ProjectAddChoice.vue'
import ProjectAddRepos from '@/components/project/ProjectAddRepos.vue'
import { paletteHead, paletteInput } from '@/components/project/palette'
import { ArrowLeft, Folder } from '@/components/ui/icons'
import { field, fieldText } from '@/components/ui/field'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isAppError } from '@/ipc/agent'
import type { CloneProgress } from '@/ipc/bindings/CloneProgress'
import { pickFolder } from '@/ipc/dialog'
import { githubClone, githubCloneCancel } from '@/ipc/github'
import { homeFolder } from '@/ipc/system'
import { useAddProjectStore } from '@/stores/addProject'
import { useIntegrationsStore } from '@/stores/integrations'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { parseGitUrl, parseRepo, repoFolder, urlFolder } from '@/utils/githubRepo'
import { shortcutLabel } from '@/utils/shortcuts'

const { t } = useI18n()
const store = useAddProjectStore()
const github = useIntegrationsStore()
const projects = useProjectsStore()
const navigation = useNavigationStore()
const id = useId()
const urlInput = useTemplateRef('urlInput')

const step = ref<'choose' | AddSource>('choose')
// Dépôt GitHub choisi (étape github) ou adresse tapée (étape url).
const chosen = ref('')
const url = ref('')
// Vide : le dossier prend le nom du dépôt.
const name = ref('')
const parent = ref('')
const home = ref('')
const error = ref<string | null>(null)
const cloning = ref(false)
const progress = ref<CloneProgress | null>(null)

const status = computed(() => github.github)
const source = computed(() => {
  if (step.value === 'github') return chosen.value
  const text = url.value.trim()
  return parseGitUrl(text) || parseRepo(text) ? text : ''
})
const urlInvalid = computed(() => step.value === 'url' && !!url.value.trim() && !source.value)
// Une adresse hors GitHub passe par git, sans gh.
const ready = computed(() => step.value === 'url' || status.value?.state === 'ready')
const showLocation = computed(() => step.value === 'url' || (step.value === 'github' && status.value?.state !== 'missing' && status.value?.state !== 'outdated'))
const fallback = computed(() => (!source.value ? '' : step.value === 'github' ? repoFolder(source.value) : urlFolder(source.value)))
const folder = computed(() => name.value.trim() || fallback.value)
const target = computed(() => (parent.value && folder.value ? `${parent.value.replace(/\/+$/, '')}/${folder.value}` : ''))

const key = (name: string) => shortcutLabel({ key: name, mod: false })
const keys = computed(() => [
  ...(step.value === 'url'
    ? []
    : [
        { id: 'navigate', keys: [key('ArrowUp'), key('ArrowDown')], label: t('addProject.navigate') },
        { id: 'select', keys: [key('Enter')], label: t('addProject.select') },
      ]),
  ...(step.value === 'choose' ? [] : [{ id: 'back', keys: [key('Backspace')], label: t('addProject.back') }]),
  { id: 'close', keys: [key('Escape')], label: t('addProject.close') },
])

watch(
  () => store.open,
  (value) => {
    if (!value) return
    step.value = 'choose'
    error.value = null
    if (!github.github) void github.load()
  },
)

function short(path: string) {
  return home.value && path.startsWith(home.value) ? `~${path.slice(home.value.replace(/\/+$/, '').length)}` : path
}

function pick(next: AddSource) {
  if (next === 'local') void chooseLocal()
  else void enter(next)
}

// La fenêtre s'efface pendant le sélecteur natif, la promesse de request() attend son résultat.
async function chooseLocal() {
  store.open = false
  const path = await pickFolder(t('rail.pickProject'))
  store.finish(path ? projects.add(path) : null)
}

async function enter(next: 'github' | 'url') {
  step.value = next
  chosen.value = ''
  url.value = ''
  name.value = ''
  error.value = null
  progress.value = null
  if (next === 'url') void nextTick(() => urlInput.value?.focus())
  if (!home.value) home.value = await homeFolder().catch(() => '')
  if (!parent.value) parent.value = store.parent ?? defaultParent()
}

function back() {
  if (cloning.value) return
  step.value = 'choose'
  error.value = null
}

// Retour arrière dans le champ vide d'une étape : on revient aux sources, comme T3 Code.
function onKeydown(event: KeyboardEvent) {
  const input = event.target
  if (event.key !== 'Backspace' || step.value === 'choose' || !(input instanceof HTMLInputElement) || !input.hasAttribute('data-palette-input') || input.value) return
  event.preventDefault()
  back()
}

// Le dossier qui contient le plus de projets (hors dossiers temporaires), sinon le dossier personnel.
function defaultParent() {
  const counts = new Map<string, number>()
  for (const { path } of projects.projects) {
    const folder = path.replace(/\/[^/]+\/?$/, '')
    if (!folder || /^\/(private\/)?(tmp|var)\//.test(folder)) continue
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? home.value
}

async function changeParent() {
  const path = await pickFolder(t('addProject.pickParent'), parent.value || undefined)
  if (path) parent.value = path
}

function openSettings() {
  store.finish(null)
  navigation.showSettingsDetail('github')
}

async function clone() {
  if (!source.value || !target.value || !ready.value || cloning.value) return
  cloning.value = true
  error.value = null
  progress.value = null
  try {
    const path = await githubClone(source.value, parent.value, folder.value, (next) => (progress.value = next))
    store.rememberParent(parent.value)
    store.finish(projects.add(path))
  } catch (failure) {
    if (cloning.value) error.value = isAppError(failure) ? failure.message : String(failure)
  } finally {
    cloning.value = false
    progress.value = null
  }
}

async function stop() {
  cloning.value = false
  await githubCloneCancel()
}

function onOpenChange(value: boolean) {
  if (!value && !cloning.value) store.finish(null)
}

// git écrit l'étape dans la langue du système : affichée telle quelle.
const stage = computed(() => progress.value?.stage ?? t('addProject.starting'))
</script>

<template>
  <DialogRoot :open="store.open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="ui-overlay fixed inset-0 z-50 bg-black/40" />
      <DialogContent
        class="ui-glass ui-glass-raised fixed inset-0 z-50 m-auto flex h-fit max-h-[76vh] w-[min(34rem,calc(100%-2rem))] flex-col rounded-2xl text-content outline-none select-none"
        @open-auto-focus.prevent
        @escape-key-down="cloning && $event.preventDefault()"
        @pointer-down-outside="cloning && $event.preventDefault()"
        @keydown="onKeydown"
      >
        <form class="ui-dialog-body flex min-h-0 flex-col" @submit.prevent="clone">
          <ProjectAddChoice v-if="step === 'choose'" :setup="status?.state === 'missing' || status?.state === 'outdated'" @pick="pick" />
          <ProjectAddRepos v-else-if="step === 'github'" v-model="chosen" :disabled="cloning" @back="back" @settings="openSettings" />
          <template v-else>
            <div :class="paletteHead">
              <UiIconButton :label="t('addProject.back')" :disabled="cloning" class="-ms-1.5" @click="back">
                <ArrowLeft class="size-4 rtl:rotate-180" />
              </UiIconButton>
              <input
                ref="urlInput"
                v-model="url"
                type="text"
                data-palette-input
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                writingsuggestions="false"
                :disabled="cloning"
                :aria-label="t('addProject.url')"
                :aria-invalid="urlInvalid || undefined"
                :placeholder="t('addProject.urlPlaceholder')"
                :class="paletteInput"
              />
            </div>
            <DialogTitle class="sr-only">{{ t('addProject.url') }}</DialogTitle>
            <DialogDescription class="sr-only">{{ t('addProject.urlHint') }}</DialogDescription>
          </template>

          <div v-if="showLocation" class="px-3.5 pt-3 pb-3.5" :class="{ 'border-t border-stroke': step === 'github' }">
            <p :id="`${id}-location`" class="text-xs font-medium text-muted">{{ t('addProject.location') }}</p>
            <div class="mt-1.5 flex items-center gap-1.5" role="group" :aria-labelledby="`${id}-location`">
              <button
                type="button"
                data-control
                :disabled="cloning"
                :class="[field, 'h-8 max-w-[60%] shrink-0 text-xs hover:bg-selection-hover']"
                :aria-label="t('addProject.pickParent')"
                :title="parent"
                @click="changeParent"
              >
                <Folder class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span class="truncate">{{ short(parent) || '…' }}</span>
              </button>
              <span class="text-muted" aria-hidden="true">/</span>
              <label :class="[field, 'h-8 flex-1']" data-control>
                <span class="sr-only">{{ t('addProject.folderName') }}</span>
                <input
                  v-model="name"
                  type="text"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  writingsuggestions="false"
                  :disabled="cloning"
                  :placeholder="fallback || t('addProject.folderName')"
                  :class="fieldText"
                />
              </label>
            </div>
            <p v-if="urlInvalid" class="mt-1.5 h-4 truncate text-[11px] text-warning" role="status">{{ t('addProject.urlInvalid') }}</p>
            <p v-else class="mt-1.5 h-4 truncate font-mono text-[11px] text-muted select-text" :title="target">{{ short(target) }}</p>
            <p v-if="error" class="mt-2 text-xs/relaxed text-danger select-text" role="alert">{{ error }}</p>
          </div>

          <div class="flex h-11 shrink-0 items-center gap-3 border-t border-stroke ps-3.5 pe-2">
            <div v-if="cloning" class="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-muted" role="status">
              <span class="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-content/10">
                <span class="block h-full rounded-full bg-signal transition-[width] duration-200" :style="{ width: `${progress?.percent ?? 4}%` }" />
              </span>
              <span class="truncate">{{ stage }}<template v-if="progress?.percent != null"> {{ progress.percent }} %</template></span>
            </div>
            <ul v-else class="flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden text-xs whitespace-nowrap text-muted" aria-hidden="true">
              <li v-for="item in keys" :key="item.id" class="flex items-center gap-1.5">
                <kbd v-for="label in item.keys" :key="label" class="grid h-5 min-w-5 place-items-center rounded-sm bg-content/8 px-1 font-sans text-[11px] text-content/80">
                  {{ label }}
                </kbd>
                {{ item.label }}
              </li>
            </ul>
            <template v-if="step !== 'choose'">
              <UiButton v-if="cloning" size="sm" @click="stop">{{ t('addProject.stop') }}</UiButton>
              <UiButton type="submit" size="sm" variant="primary" :disabled="!source || !target || !ready" :loading="cloning">
                {{ t('addProject.clone') }}
              </UiButton>
            </template>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
