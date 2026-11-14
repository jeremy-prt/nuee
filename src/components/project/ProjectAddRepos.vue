<script setup lang="ts">
import { DialogDescription, DialogTitle, ListboxContent, ListboxFilter, ListboxItem, ListboxRoot } from 'reka-ui'
import { computed, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectGithubMenu from '@/components/project/ProjectGithubMenu.vue'
import { paletteHead, paletteInput, paletteRow } from '@/components/project/palette'
import { ArrowLeft, GitFork, Github, Lock, RefreshCw } from '@/components/ui/icons'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { isAppError } from '@/ipc/agent'
import { githubRepos } from '@/ipc/github'
import { useAddProjectStore } from '@/stores/addProject'
import { accountKey, useIntegrationsStore } from '@/stores/integrations'
import { parseRepo } from '@/utils/githubRepo'
import { normalize } from '@/utils/search'

// Étape « Dépôt GitHub » : les dépôts du compte actif de gh, filtrés par propriétaire, ou une adresse collée.
defineProps<{ disabled: boolean }>()
const chosen = defineModel<string>({ required: true })
const emit = defineEmits<{ back: []; settings: [] }>()

const { t } = useI18n()
const store = useAddProjectStore()
const github = useIntegrationsStore()
const id = useId()
const listbox = useTemplateRef('listbox')

const query = ref('')
// Propriétaire affiché (compte ou organisation) ; une recherche porte sur tous.
const owner = ref('')
const loading = ref(false)
const listError = ref<string | null>(null)

const status = computed(() => github.github)
const unusable = computed(() => status.value?.state === 'missing' || status.value?.state === 'outdated')
const accounts = computed(() =>
  status.value?.state === 'ready'
    ? status.value.accounts.filter((account) => account.host === 'github.com').sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: 'base' }))
    : [],
)
const active = computed(() => accounts.value.find((account) => account.active) ?? null)
const activeKey = computed(() => (active.value ? accountKey(active.value) : ''))
const repos = computed(() => store.repos[activeKey.value] ?? [])
const ownerOf = (repo: { name: string }) => repo.name.split('/')[0]!
// Le compte d'abord, puis ses organisations.
const owners = computed(() => {
  const login = active.value?.login ?? ''
  const others = [...new Set(repos.value.map(ownerOf))].filter((item) => item !== login).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return (repos.value.some((repo) => ownerOf(repo) === login) ? [login, ...others] : others).map((item) => ({ value: item, login: item }))
})
const accountItems = computed(() => accounts.value.map((account) => ({ value: accountKey(account), login: account.login, disabled: account.state !== 'ok' })))
const accountModel = computed({
  get: () => activeKey.value,
  set: (key: string) => {
    const account = accounts.value.find((item) => accountKey(item) === key)
    if (account && !account.active) void github.makeActive(account, false)
  },
})
const pickAccount = computed(() => accounts.value.length > 1)
// L'avatar du compte n'apparaît qu'une fois : déjà sur le sélecteur de compte, il quitte celui du propriétaire.
const ownerAvatar = computed(() => !pickAccount.value || owner.value !== active.value?.login)

const typed = computed(() => parseRepo(query.value))
const searching = computed(() => !!query.value.trim() && !typed.value)
const shown = computed(() => {
  if (!searching.value) return repos.value.filter((repo) => ownerOf(repo) === owner.value)
  const needle = normalize(query.value.trim())
  return repos.value.filter((repo) => normalize(repo.name).includes(needle))
})
// Une adresse collée qui n'est pas dans la liste se clone quand même.
const extra = computed(() => (typed.value && !repos.value.some((repo) => repo.name.toLowerCase() === typed.value!.toLowerCase()) ? typed.value : null))

watch(owners, (list) => {
  if (!list.some((item) => item.value === owner.value)) owner.value = list[0]?.value ?? ''
}, { immediate: true })

watch(typed, (repo) => {
  if (repo) chosen.value = extra.value ?? repos.value.find((item) => item.name.toLowerCase() === repo.toLowerCase())?.name ?? repo
})

watch(activeKey, (key, previous) => {
  if (key && key !== previous) void loadRepos()
})

// La liste arrive après l'ouverture : la première ligne prend le surlignage, Entrée la choisit.
watch(
  () => shown.value.length > 0,
  (some) => some && !listbox.value?.highlightedElement && listbox.value?.highlightFirstItem(),
)

onMounted(async () => {
  if (!github.github) await github.load()
  if (activeKey.value) void loadRepos()
})

let run = 0
async function loadRepos() {
  const key = activeKey.value
  const current = ++run
  loading.value = true
  listError.value = null
  try {
    store.setRepos(key, await githubRepos())
  } catch (failure) {
    if (current === run) listError.value = isAppError(failure) ? failure.message : String(failure)
  } finally {
    if (current === run) loading.value = false
  }
}

// En mode « toggle », reka désélectionne le choix déjà fait : on le garde.
function pick(value: unknown) {
  if (typeof value === 'string') chosen.value = value
}
</script>

<template>
  <ListboxRoot
    ref="listbox"
    :model-value="chosen"
    highlight-on-hover
    :disabled="disabled"
    :aria-labelledby="`${id}-repos`"
    class="flex min-h-0 flex-col"
    @update:model-value="pick"
  >
    <div :class="paletteHead">
      <UiIconButton :label="t('addProject.back')" :disabled="disabled" class="-ms-1.5" @click="emit('back')">
        <ArrowLeft class="size-4 rtl:rotate-180" />
      </UiIconButton>
      <!-- Entrée choisit la ligne surlignée, jamais le clone : celui-ci part du bouton ou du nom de dossier. -->
      <ListboxFilter
        v-model="query"
        auto-focus
        data-palette-input
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :aria-label="t('addProject.search')"
        :placeholder="t('addProject.search')"
        :class="paletteInput"
        @keydown.enter.prevent
      />
      <UiIconButton v-if="active" :label="t('addProject.refresh')" :loading="loading" :disabled="disabled" class="-me-1.5" @click="loadRepos">
        <RefreshCw class="size-3.5" />
      </UiIconButton>
    </div>
    <DialogTitle class="sr-only">{{ t('addProject.github') }}</DialogTitle>
    <DialogDescription class="sr-only">{{ t('addProject.githubHint') }}</DialogDescription>

    <div v-if="unusable" class="flex flex-col items-start gap-3 px-3.5 py-4 text-sm">
      <p class="font-medium text-warning">{{ t(status?.state === 'missing' ? 'addProject.missing' : 'addProject.outdated') }}</p>
      <UiButton size="sm" @click="emit('settings')">{{ t('addProject.openSettings') }}</UiButton>
    </div>

    <template v-else>
      <p v-if="status && !active" class="px-3.5 pt-3 text-xs/relaxed text-warning">
        {{ t('addProject.signedOut') }}
        <button type="button" class="ms-1 text-content underline underline-offset-2" @click="emit('settings')">{{ t('addProject.openSettings') }}</button>
      </p>

      <div class="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 ps-3.5 pe-2 pt-1.5">
        <span :id="`${id}-repos`" class="me-auto text-xs font-medium text-muted">{{ t('addProject.repos') }}</span>
        <div v-if="pickAccount" class="flex items-center gap-1">
          <span class="text-xs text-muted" aria-hidden="true">{{ t('addProject.account') }}</span>
          <ProjectGithubMenu v-model="accountModel" :label="t('addProject.account')" :sections="[{ items: accountItems }]" :disabled="disabled || !!github.switching" />
        </div>
        <div v-if="owners.length > 1" class="flex items-center gap-1">
          <span class="text-xs text-muted" aria-hidden="true">{{ t('addProject.owner') }}</span>
          <ProjectGithubMenu v-model="owner" :label="t('addProject.owner')" :sections="[{ items: owners }]" :avatar="ownerAvatar" :disabled="disabled || searching" />
        </div>
      </div>

      <ListboxContent class="flex h-60 flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5">
        <ListboxItem v-if="extra" :value="extra" :class="[paletteRow, 'h-8 text-[13px]']">
          <Github class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ extra }}</span>
          <span class="shrink-0 text-xs text-muted">{{ t('addProject.typed') }}</span>
        </ListboxItem>
        <UiSkeleton v-if="loading && !repos.length" :label="t('addProject.loading')" :rows="7" />
        <p v-else-if="listError && !repos.length" class="px-2 py-1.5 text-xs/relaxed text-danger select-text">{{ listError }}</p>
        <p v-else-if="!shown.length && !extra && active" class="px-2 py-1.5 text-xs text-muted">{{ t('addProject.none') }}</p>
        <ListboxItem v-for="repo in shown" :key="repo.name" :value="repo.name" :class="[paletteRow, 'h-8 text-[13px]']">
          <span class="min-w-0 flex-1 truncate">
            <span v-if="ownerOf(repo) !== owner" class="text-muted">{{ ownerOf(repo) }}/</span>{{ repo.name.split('/')[1] }}
          </span>
          <span v-if="repo.archived" class="shrink-0 rounded-sm bg-content/8 px-1.5 py-px text-[11px] text-muted">{{ t('addProject.archived') }}</span>
          <!-- Colonne fixe : les cadenas restent alignés d'une ligne à l'autre. -->
          <span class="flex w-8 shrink-0 items-center justify-end gap-1.5 text-muted">
            <GitFork v-if="repo.fork" class="size-3" :aria-label="t('addProject.fork')" />
            <Lock v-if="repo.private" class="size-3" :aria-label="t('addProject.private')" />
          </span>
        </ListboxItem>
      </ListboxContent>
    </template>
  </ListboxRoot>
</template>
