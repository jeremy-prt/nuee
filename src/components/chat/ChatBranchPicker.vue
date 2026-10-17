<script setup lang="ts">
import { Check, ChevronDown, GitBranch, GitBranchPlus, Search } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isAppError } from '@/ipc/agent'
import type { BranchList } from '@/ipc/bindings/BranchList'
import { worktreeRefs, worktreeSwitch } from '@/ipc/worktree'
import type { Project } from '@/stores/projects'
import { useWorktreesStore } from '@/stores/worktrees'
import { normalize } from '@/utils/search'

// Branche du dossier de la session, une fois lancée : la changer, ou en créer une depuis le HEAD actuel.
// `fallback` : le nom affiché avant la première lecture. Rien ne s'affiche hors d'un dépôt git.
const props = defineProps<{ chatId: string; project: Project; fallback: string; disabled: boolean }>()

const { t } = useI18n()
const worktrees = useWorktreesStore()
const open = ref(false)
const query = ref('')
const list = shallowRef<BranchList | null>(null)
const failed = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
// Fichiers non commités qui empêchent de passer sur la branche choisie.
const blocked = ref<string[] | null>(null)

async function load() {
  try {
    list.value = await worktreeRefs(props.chatId, props.project.path)
    failed.value = false
  } catch {
    failed.value = true
  }
}
load()

watch(open, (value) => {
  if (value) load()
  else {
    query.value = ''
    error.value = null
    blocked.value = null
  }
})
watch(query, () => {
  error.value = null
  blocked.value = null
})

const label = computed(() => (list.value ? (list.value.current ?? t('composer.branch.detached')) : props.fallback))
const wanted = computed(() => query.value.trim())
const shown = computed(() => {
  const needle = normalize(wanted.value)
  const branches = list.value?.branches ?? []
  return needle ? branches.filter((branch) => normalize(branch.name).includes(needle)) : branches
})
const creatable = computed(() => !!wanted.value && !list.value?.branches.some((branch) => branch.name === wanted.value))

// Valeurs du listbox : le nom d'une branche, ou la création préfixée pour ne jamais se confondre avec lui. Sa
// valeur reste '' : reka renverrait sinon `undefined` au second choix de la même branche (après un blocage).
const CREATE = '\0create:'
async function choose(value: unknown) {
  if (typeof value !== 'string' || pending.value) return
  const create = value.startsWith(CREATE)
  const branch = create ? value.slice(CREATE.length) : value
  if (!create && branch === list.value?.current) {
    open.value = false
    return
  }
  pending.value = true
  try {
    const outcome = await worktreeSwitch(props.chatId, props.project.path, branch, create)
    if (outcome.kind === 'blocked') {
      blocked.value = outcome.files
      return
    }
    open.value = false
    await load()
    worktrees.load(props.project)
  } catch (cause) {
    error.value = isAppError(cause) ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

const blockedText = computed(() => {
  const files = blocked.value ?? []
  const named = files.slice(0, 3).join(', ') + (files.length > 3 ? '…' : '')
  return t('composer.branch.blocked', { files: named })
})

const item =
  'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-content/80 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[disabled]:cursor-default data-[disabled]:opacity-50'
</script>

<template>
  <PopoverRoot v-if="!failed" v-model:open="open">
    <PopoverTrigger
      :disabled="disabled"
      class="flex h-6 min-w-0 items-center gap-1 rounded-md ps-1.5 pe-1 text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none data-[state=open]:bg-selection-hover"
    >
      <GitBranch class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('composer.branch.label') }}</span>
      <span class="truncate">{{ label }}</span>
      <ChevronDown class="size-3 shrink-0" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent side="bottom" align="end" :side-offset="6" :collision-padding="8" class="ui-pop z-50 w-72 text-[13px] text-content select-none">
        <ListboxRoot model-value="" highlight-on-hover :aria-label="t('composer.branch.label')" @update:model-value="choose">
          <div class="flex h-9 items-center gap-2 border-b border-stroke px-3">
            <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <ListboxFilter
              v-model="query"
              auto-focus
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              writingsuggestions="false"
              :aria-label="t('composer.branch.search')"
              :placeholder="t('composer.branch.search')"
              class="min-w-0 flex-1 bg-transparent outline-none select-text placeholder:text-muted"
            />
          </div>
          <ListboxContent class="max-h-72 overflow-y-auto p-1">
            <p v-if="!shown.length && !creatable" class="px-2 py-1.5 text-muted">{{ t('composer.branch.none') }}</p>
            <ListboxItem v-for="branch in shown" :key="branch.name" :value="branch.name" :disabled="branch.elsewhere || pending" :class="item">
              <span class="grid size-3.5 shrink-0 place-items-center">
                <Check v-if="branch.name === list?.current" class="size-3.5" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1 truncate" :class="{ 'font-medium': branch.name === list?.current }">{{ branch.name }}</span>
              <span v-if="branch.elsewhere" class="shrink-0 text-xs text-muted">{{ t('composer.branch.elsewhere') }}</span>
            </ListboxItem>
            <ListboxItem v-if="creatable" :value="CREATE + wanted" :disabled="pending" :class="item">
              <GitBranchPlus class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ t('composer.branch.create', { name: wanted }) }}</span>
            </ListboxItem>
          </ListboxContent>
          <p v-if="blocked" class="border-t border-stroke px-3 py-2 text-xs text-warning" role="alert">{{ blockedText }}</p>
          <p v-else-if="error" class="border-t border-stroke px-3 py-2 text-xs text-danger" role="alert">{{ error }}</p>
        </ListboxRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
