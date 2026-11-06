<script setup lang="ts">
import { ChevronRight, Coffee, Folder, FolderOpen, FolderTree, GitBranch, NoProject, RemoteControl } from '@/components/ui/icons'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useMachineName } from '@/composables/useMachineName'
import { useCommitRequest } from '@/composables/useCommitRequest'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import type { WorktreeChanges } from '@/ipc/bindings/WorktreeChanges'
import { projectReveal } from '@/ipc/project'
import { worktreeChanges } from '@/ipc/worktree'
import { useConversationsStore } from '@/stores/conversations'
import { useGeneralStore } from '@/stores/general'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'
import { fileName, fileVerb } from '@/utils/activity'
import { contextFormats, contextRatio, contextRows } from '@/utils/context'
import { tasksOf } from '@/utils/tasks'

// Résumé de la session active, comme le volet Environnement de Claude Code : où travaille l'agent, son contexte,
// ses tâches et ce qu'il a produit.
const { t, locale } = useI18n()
const { chat } = useTerminalChat()
const { phase, commit } = useCommitRequest()
const projects = useProjectsStore()
const worktrees = useWorktreesStore()
const conversations = useConversationsStore()
const toasts = useToastsStore()
const machine = useMachineName()
const layout = useLayoutStore()
const general = useGeneralStore()

// Sections repliées, mémorisées en local : simple confort, rien de grave si la lecture échoue.
const COLLAPSED_KEY = 'nuee.sessionPanel.v1'
const sections = ['environment', 'context', 'tasks', 'results', 'changes'] as const
type Section = (typeof sections)[number]
const collapsed = reactive<Record<Section, boolean>>(Object.fromEntries(sections.map((name) => [name, false])) as Record<Section, boolean>)
try {
  const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')
  if (saved && typeof saved === 'object')
    for (const name of sections) collapsed[name] = (saved as Record<string, unknown>)[name] === true
} catch {
  // Valeurs par défaut : tout déplié.
}
watch(collapsed, (value) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(value))
  } catch {
    // Stockage indisponible : l'état reste valable jusqu'à la fermeture.
  }
})

const project = computed(() => projects.byId(chat.value?.projectId ?? null))
const branch = computed(() => (chat.value ? worktrees.branchOf(chat.value) : null))
const folder = computed(() => {
  const tab = chat.value
  if (!project.value || !tab) return null
  return tab.worktree ? tab.worktreePath : project.value.path
})
const items = computed(() => (chat.value ? (conversations.find(chat.value.id)?.items ?? []) : []))

const context = computed(() => (chat.value ? (conversations.find(chat.value.id)?.context ?? null) : null))
const formats = computed(() => contextFormats(locale.value))
const ratio = computed(() => (context.value ? contextRatio(context.value) : 0))
const percent = computed(() => formats.value.percent.format(ratio.value))
const tone = computed(() => (ratio.value >= 0.9 ? 'bg-danger' : ratio.value >= 0.75 ? 'bg-warning' : 'bg-info'))
const contextOpen = ref(false)
const categories = computed(() => {
  if (!context.value) return []
  const rows = contextRows(context.value, formats.value)
  return [...rows.filled, ...rows.free, ...rows.deferred]
})

const tasks = computed(() => tasksOf(items.value))
const running = computed(() => tasks.value.filter(({ task }) => task.status === 'running'))
const finished = computed(() => tasks.value.length - running.value.length)

// Un fichier par ligne, dans l'ordre où l'agent l'a touché la première fois.
const results = computed(() => {
  const paths = new Set<string>()
  for (const item of items.value) {
    if (item.kind !== 'tool' || !item.summary || item.status === 'failed') continue
    const verb = fileVerb(item)
    if (verb === 'created' || verb === 'edited') paths.add(item.summary)
  }
  const root = folder.value ? `${folder.value.replace(/[\\/]+$/, '')}/` : null
  return [...paths].map((path) => {
    const relative = root && path.startsWith(root) ? path.slice(root.length) : path
    const name = fileName(relative)
    return { path, name, dir: relative.slice(0, -name.length).replace(/[\\/]+$/, '') }
  })
})
const { shown, more, limit, sentinel } = useProgressiveList(results, () => chat.value?.id)

// État git réel du dossier de la session, relu à chaque fin de tour : l'agent a pu commiter ou modifier.
const changes = ref<WorktreeChanges | null>(null)
let request = 0
async function loadChanges() {
  const id = ++request
  const tab = chat.value
  if (!tab?.started || !project.value) return (changes.value = null)
  try {
    const result = await worktreeChanges(tab.id, project.value.path)
    if (id === request) changes.value = result
  } catch {
    if (id === request) changes.value = null
  }
}
watch([() => chat.value?.id, () => chat.value?.started, () => project.value?.path, folder], loadChanges, { immediate: true })
watch(phase, (value, previous) => {
  if (value === 'idle' && previous && previous !== 'idle') loadChanges()
})

async function reveal() {
  if (!folder.value) return
  try {
    await projectReveal(folder.value)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.revealFailed'), body: isAppError(error) ? error.message : String(error) })
  }
}

const row = 'flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-start text-[13px]'
const action = `${row} hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring`
const title = 'flex h-7 w-full items-center gap-1 rounded-lg px-2 text-start text-xs font-medium text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring'
const empty = `${row} text-muted`
</script>

<template>
  <div v-if="chat?.started" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
    <section class="flex flex-col gap-0.5">
      <h3>
        <button type="button" :class="title" :aria-expanded="!collapsed.environment" @click="collapsed.environment = !collapsed.environment">
          {{ t('dock.session.environment') }}<ChevronRight class="size-3" :class="{ 'rotate-90': !collapsed.environment }" aria-hidden="true" />
        </button>
      </h3>
      <template v-if="!collapsed.environment">
        <p :class="row">
          <NoProject class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="truncate">{{ machine || t('composer.hosts.local') }}</span>
        </p>
        <!-- Comme l'app Claude : la ligne reste du texte, seule l'icône à droite ouvre le dossier (son chemin en infobulle). -->
        <div v-if="folder" :class="row">
          <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
          <span class="min-w-0 flex-1 truncate">{{ project?.name }}</span>
          <UiIconButton :label="`${t('settings.projects.reveal')} · ${folder}`" class="-me-1.5" @click="reveal">
            <FolderOpen class="size-3.5" aria-hidden="true" />
          </UiIconButton>
        </div>
        <p v-else :class="row">
          <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
          <component :is="chat.worktree ? FolderTree : Folder" v-else class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="truncate">{{ project?.name ?? t('rail.chats') }}</span>
        </p>
        <p v-if="branch" :class="row">
          <GitBranch class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="sr-only">{{ t('composer.branch.label') }}</span>
          <span class="truncate">{{ branch }}</span>
        </p>
        <p v-else :class="empty">
          <GitBranch class="size-4 shrink-0" aria-hidden="true" />
          {{ t('dock.session.noBranch') }}
        </p>
        <!-- Le même réglage que Réglages › Général, raccourci ici comme dans l'app Claude. -->
        <UiTooltip :label="t('settings.general.system.keepAwake')" side="bottom">
          <div :class="row">
            <Coffee class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate" aria-hidden="true">{{ t('dock.session.keepAwake') }}</span>
            <UiSwitch v-model="general.keepAwake" :label="t('settings.general.system.keepAwake')" />
          </div>
        </UiTooltip>
        <UiTooltip :label="t('dock.session.soon')" side="bottom">
          <div :class="row">
            <RemoteControl class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-muted" aria-hidden="true">{{ t('dock.session.remoteControl') }}</span>
            <UiSwitch :model-value="false" :label="`${t('dock.session.remoteControl')} · ${t('dock.session.soon')}`" disabled class="pointer-events-none" />
          </div>
        </UiTooltip>
      </template>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3>
        <button type="button" :class="title" :aria-expanded="!collapsed.context" @click="collapsed.context = !collapsed.context">
          {{ t('dock.session.context') }}<ChevronRight class="size-3" :class="{ 'rotate-90': !collapsed.context }" aria-hidden="true" />
        </button>
      </h3>
      <template v-if="!collapsed.context && context">
        <button type="button" :class="action" :aria-expanded="contextOpen" @click="contextOpen = !contextOpen">
          <span class="flex-1 tabular-nums">{{ t('composer.context.used', { percent }) }}</span>
          <span class="h-1.5 w-16 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
            <span class="block h-full rounded-full" :class="tone" :style="{ width: `${ratio * 100}%` }" />
          </span>
          <ChevronRight class="size-3.5 shrink-0 text-muted" :class="{ 'rotate-90': contextOpen }" aria-hidden="true" />
        </button>
        <ul v-if="contextOpen" class="flex flex-col gap-1.5 px-2 pt-1 pb-1 text-xs">
          <li v-for="item in categories" :key="item.name" class="flex items-center gap-2" :class="{ 'text-muted': item.kind === 'deferred' }">
            <span class="size-2.5 shrink-0 rounded-sm" :class="item.color" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span class="text-muted tabular-nums">{{ formats.tokens.format(item.tokens) }}</span>
            <span class="w-12 text-end tabular-nums">{{ item.share }}</span>
          </li>
        </ul>
      </template>
      <p v-else-if="!collapsed.context" :class="empty">{{ t('dock.session.noContext') }}</p>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3>
        <button type="button" :class="title" :aria-expanded="!collapsed.tasks" @click="collapsed.tasks = !collapsed.tasks">
          {{ t('dock.tasks.title') }}<ChevronRight class="size-3" :class="{ 'rotate-90': !collapsed.tasks }" aria-hidden="true" />
        </button>
      </h3>
      <template v-if="!collapsed.tasks">
        <p v-for="{ tool, task } in running" :key="task.id" :class="row">
          <ChatSpinner :agent="chat.agent" class="text-sm" />
          <span class="truncate">{{ task.description ?? tool.detail?.description ?? tool.summary ?? tool.name }}</span>
        </p>
        <p v-if="finished" :class="empty">{{ t('dock.session.finished', { n: finished }, finished) }}</p>
        <p v-if="!tasks.length" :class="empty">{{ t('dock.session.noTasks') }}</p>
      </template>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3>
        <button type="button" :class="title" :aria-expanded="!collapsed.results" @click="collapsed.results = !collapsed.results">
          {{ t('dock.session.results') }}<ChevronRight class="size-3" :class="{ 'rotate-90': !collapsed.results }" aria-hidden="true" />
        </button>
      </h3>
      <template v-if="!collapsed.results">
        <button v-for="file in shown" :key="file.path" type="button" :class="action" :title="file.path" @click="layout.showChanges(file.path)">
          <UiFileIcon :name="file.name" class="size-4 shrink-0" />
          <span class="shrink-0">{{ file.name }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">{{ file.dir }}</span>
        </button>
        <span v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
        <p v-if="!results.length" :class="empty">{{ t('dock.session.noResults') }}</p>
      </template>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3>
        <button type="button" :class="title" :aria-expanded="!collapsed.changes" @click="collapsed.changes = !collapsed.changes">
          {{ t('dock.changes.title') }}<ChevronRight class="size-3" :class="{ 'rotate-90': !collapsed.changes }" aria-hidden="true" />
        </button>
      </h3>
      <template v-if="!collapsed.changes">
        <template v-if="changes?.files">
          <button type="button" :class="action" @click="layout.showChanges()">
            <span class="flex-1 truncate">{{ t('dock.session.files', { n: changes.files }, changes.files) }}</span>
            <ChatDiffStat :added="changes.added" :removed="changes.removed" plain class="text-xs" />
            <ChevronRight class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          </button>
          <UiButton size="sm" class="mx-2 mt-1" :disabled="phase !== 'idle'" @click="commit">{{ t('dock.session.commit') }}</UiButton>
        </template>
        <p v-else :class="empty">{{ t('dock.session.noChanges') }}</p>
      </template>
    </section>
  </div>
  <p v-else class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.session.empty') }}</p>
</template>
