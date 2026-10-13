<script setup lang="ts">
import { Check } from '@/components/ui/icons'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { isAppError } from '@/ipc/agent'
import type { Worktree } from '@/ipc/bindings/Worktree'
import { worktreeBranches } from '@/ipc/worktree'
import type { Project } from '@/stores/projects'
import { useWorktreesStore } from '@/stores/worktrees'
import { normalize } from '@/utils/search'

const props = defineProps<{ project: Project; trees: Worktree[] }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const worktrees = useWorktreesStore()
const id = useId()
const nameInput = useTemplateRef('nameInput')
const searchInput = useTemplateRef('searchInput')

const kind = ref<'new' | 'existing'>('new')
const name = ref('')
const query = ref('')
const chosen = ref('')
const branches = ref<string[]>([])
const saving = ref(false)
const error = ref<string | null>(null)

// Chaque ouverture repart d'un formulaire vide et relit les branches : elles ont pu changer dans un terminal.
watch(open, (value) => {
  if (!value) return
  kind.value = 'new'
  name.value = ''
  query.value = ''
  chosen.value = ''
  error.value = null
  worktreeBranches(props.project.path)
    .then((list) => (branches.value = list))
    .catch(() => (branches.value = []))
})
watch(kind, async () => {
  error.value = null
  await nextTick()
  ;(kind.value === 'new' ? nameInput : searchInput).value?.focus()
})

const kinds = computed(() => [
  { value: 'new' as const, label: t('settings.projects.worktrees.dialog.newBranch') },
  { value: 'existing' as const, label: t('settings.projects.worktrees.dialog.existingBranch') },
])
// La branche d'où part la nouvelle : celle du worktree qui contient le dossier du projet.
const base = computed(() => {
  const home = props.trees
    .filter((tree) => props.project.path === tree.path || props.project.path.startsWith(`${tree.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return home?.branch ?? null
})
const taken = computed(() => new Set(props.trees.flatMap((tree) => tree.branch ?? [])))
const shown = computed(() => {
  const needle = normalize(query.value.trim())
  const list = needle ? branches.value.filter((branch) => normalize(branch).includes(needle)) : branches.value
  return list.map((branch) => ({ branch, taken: taken.value.has(branch) }))
})
const branch = computed(() => (kind.value === 'new' ? name.value.trim() : chosen.value))

async function submit() {
  if (!branch.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    await worktrees.create(props.project, branch.value, kind.value === 'existing')
    open.value = false
  } catch (failure) {
    error.value = isAppError(failure) ? failure.message : String(failure)
  } finally {
    saving.value = false
  }
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  nameInput.value?.focus()
}

const field =
  'h-8 w-full min-w-0 rounded-md border border-stroke bg-selection/50 px-2.5 text-sm outline-none select-text focus:border-stroke-focus'
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="ui-overlay fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="ui-glass ui-glass-raised fixed inset-0 z-50 m-auto h-fit w-[min(27rem,calc(100%-2rem))] rounded-xl text-content outline-none select-none"
        @open-auto-focus="onOpenAutoFocus"
      >
        <form class="ui-dialog-body p-5" @submit.prevent="submit">
          <DialogTitle class="text-sm font-semibold">{{ t('settings.projects.worktrees.dialog.title') }}</DialogTitle>
          <DialogDescription class="mt-1.5 text-sm/relaxed text-muted">{{ t('settings.projects.worktrees.dialog.hint') }}</DialogDescription>

          <UiSegmented v-model="kind" class="mt-4" :label="t('settings.projects.worktrees.dialog.kind')" :options="kinds" />

          <div v-if="kind === 'new'" class="mt-4">
            <label :for="`${id}-name`" class="text-xs font-medium">{{ t('settings.projects.worktrees.dialog.name') }}</label>
            <input
              :id="`${id}-name`"
              ref="nameInput"
              v-model="name"
              type="text"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              writingsuggestions="false"
              placeholder="feat/…"
              data-control :class="[field, 'mt-1.5 font-mono']"
              :aria-describedby="`${id}-from`"
            />
            <p :id="`${id}-from`" class="mt-1.5 text-xs/relaxed text-muted">
              {{ base ? t('settings.projects.worktrees.dialog.from', { branch: base }) : t('settings.projects.worktrees.dialog.fromCommit') }}
            </p>
          </div>

          <div v-else class="mt-4">
            <label :for="`${id}-search`" class="text-xs font-medium">{{ t('settings.projects.worktrees.dialog.branch') }}</label>
            <input
              :id="`${id}-search`"
              ref="searchInput"
              v-model="query"
              type="search"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              writingsuggestions="false"
              :placeholder="t('settings.projects.worktrees.dialog.search')"
              data-control :class="[field, 'mt-1.5']"
            />
            <RadioGroupRoot
              v-model="chosen"
              :aria-label="t('settings.projects.worktrees.dialog.branch')"
              class="mt-2 max-h-48 overflow-y-auto rounded-md border border-stroke p-1"
            >
              <p v-if="!shown.length" class="px-2 py-1.5 text-xs text-muted">{{ t('settings.projects.worktrees.dialog.none') }}</p>
              <RadioGroupItem
                v-for="item in shown"
                :key="item.branch"
                :value="item.branch"
                :disabled="item.taken"
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-xs outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring enabled:cursor-pointer enabled:hover:bg-selection-hover disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-signal/15"
              >
                <span class="grid size-3.5 shrink-0 place-items-center">
                  <Check v-if="chosen === item.branch" class="size-3" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1 truncate font-mono">{{ item.branch }}</span>
                <span v-if="item.taken" class="shrink-0 text-muted">{{ t('settings.projects.worktrees.dialog.taken') }}</span>
              </RadioGroupItem>
            </RadioGroupRoot>
          </div>

          <p v-if="error" class="mt-3 text-xs/relaxed text-danger select-text" role="alert">{{ error }}</p>

          <div class="mt-5 flex justify-end gap-2">
            <UiButton variant="ghost" @click="open = false">{{ t('dialog.cancel') }}</UiButton>
            <UiButton type="submit" variant="primary" :disabled="!branch" :loading="saving">
              {{ t('settings.projects.worktrees.dialog.create') }}
            </UiButton>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
