<script setup lang="ts">
import { ChevronRight, Folder, FolderTree, GitBranch, NoProject } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import { useMachineName } from '@/composables/useMachineName'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import { projectReveal } from '@/ipc/project'
import { useConversationsStore } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'
import { fileName, fileVerb, sessionDiff } from '@/utils/activity'
import { contextFormats, contextRatio, contextRows } from '@/utils/context'
import { tasksOf } from '@/utils/tasks'

// Résumé de la session active, comme le volet Environnement de Claude Code : où travaille l'agent, son contexte,
// ses tâches et ce qu'il a produit.
const { t, locale } = useI18n()
const { chat } = useTerminalChat()
const projects = useProjectsStore()
const worktrees = useWorktreesStore()
const conversations = useConversationsStore()
const toasts = useToastsStore()
const machine = useMachineName()
const layout = useLayoutStore()

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

// Un fichier par ligne, dans l'ordre où l'agent l'a touché la première fois ; ses +/− s'additionnent.
const results = computed(() => {
  const files = new Map<string, { path: string; added: number; removed: number }>()
  for (const item of items.value) {
    if (item.kind !== 'tool' || !item.summary || item.status === 'failed') continue
    const verb = fileVerb(item)
    if (verb !== 'created' && verb !== 'edited') continue
    const file = files.get(item.summary) ?? { path: item.summary, added: 0, removed: 0 }
    file.added += item.change?.added ?? 0
    file.removed += item.change?.removed ?? 0
    files.set(item.summary, file)
  }
  const root = folder.value ? `${folder.value.replace(/[\\/]+$/, '')}/` : null
  return [...files.values()].map((file) => {
    const relative = root && file.path.startsWith(root) ? file.path.slice(root.length) : file.path
    const name = fileName(relative)
    return { ...file, name, dir: relative.slice(0, -name.length).replace(/[\\/]+$/, '') }
  })
})
const { shown, more, limit, sentinel } = useProgressiveList(results, () => chat.value?.id)
const diff = computed(() => sessionDiff(items.value))

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
const title = 'flex h-7 items-center px-2 text-xs font-medium text-muted'
const empty = `${row} text-muted`
</script>

<template>
  <div v-if="chat?.started" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
    <section class="flex flex-col gap-0.5">
      <h3 :class="title">{{ t('dock.session.environment') }}</h3>
      <p :class="row">
        <NoProject class="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span class="truncate">{{ machine || t('composer.hosts.local') }}</span>
      </p>
      <button v-if="folder" type="button" :class="action" :title="t('settings.projects.reveal')" @click="reveal">
        <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
        <span class="shrink-0">{{ project?.name }}</span>
        <span class="min-w-0 truncate text-muted">· {{ chat.worktree ? t('composer.worktree.short') : t('composer.worktree.project') }}</span>
      </button>
      <p v-else :class="row">
        <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
        <component :is="chat.worktree ? FolderTree : Folder" v-else class="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span class="shrink-0">{{ project?.name ?? t('rail.chats') }}</span>
        <span class="min-w-0 truncate text-muted">{{ project ? `· ${t('composer.worktree.short')}` : t('dock.session.scratch') }}</span>
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
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3 :class="title">{{ t('dock.session.context') }}</h3>
      <template v-if="context">
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
      <p v-else :class="empty">{{ t('dock.session.noContext') }}</p>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3>
        <button type="button" :class="[title, 'w-full gap-1 rounded-lg hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring']" @click="layout.showView('tasks')">
          {{ t('dock.tasks.title') }}<ChevronRight class="size-3" aria-hidden="true" />
        </button>
      </h3>
      <p v-for="{ tool, task } in running" :key="task.id" :class="row">
        <ChatSpinner :agent="chat.agent" class="text-sm" />
        <span class="truncate">{{ task.description ?? tool.detail?.description ?? tool.summary ?? tool.name }}</span>
      </p>
      <p v-if="finished" :class="empty">{{ t('dock.session.finished', { n: finished }, finished) }}</p>
      <p v-if="!tasks.length" :class="empty">{{ t('dock.session.noTasks') }}</p>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3 :class="title">{{ t('dock.session.results') }}</h3>
      <button v-for="file in shown" :key="file.path" type="button" :class="action" :title="file.path" @click="layout.showView('changes')">
        <span class="shrink-0">{{ file.name }}</span>
        <span class="min-w-0 flex-1 truncate text-muted">{{ file.dir }}</span>
        <ChatDiffStat :added="file.added" :removed="file.removed" plain class="text-xs" />
      </button>
      <span v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
      <p v-if="!results.length" :class="empty">{{ t('dock.session.noResults') }}</p>
    </section>

    <section class="flex flex-col gap-0.5 border-t border-stroke pt-2">
      <h3 :class="title">{{ t('dock.changes.title') }}</h3>
      <button v-if="diff.added || diff.removed" type="button" :class="action" @click="layout.showView('changes')">
        <span class="flex-1">{{ t('dock.session.lines') }}</span>
        <ChatDiffStat :added="diff.added" :removed="diff.removed" plain class="text-xs" />
        <ChevronRight class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <p v-else :class="empty">{{ t('dock.session.noChanges') }}</p>
    </section>
  </div>
  <p v-else class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.session.empty') }}</p>
</template>
