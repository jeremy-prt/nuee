<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  Coffee,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderTree,
  Gauge,
  GitBranch,
  GitBranchPlus,
  GitCompare,
  Layers,
  NoProject,
  RemoteControl,
  SlidersHorizontal,
  Square,
  SquareTerminal,
} from '@/components/ui/icons'
import { DropdownMenuItem } from 'reka-ui'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatGitRun from '@/components/chat/ChatGitRun.vue'
import ChatSessionSub from '@/components/chat/ChatSessionSub.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import ServerMenu from '@/components/server/ServerMenu.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuIcon, menuLabel, menuRow } from '@/components/ui/menuRow'
import { useDockFocus } from '@/composables/useDockFocus'
import { useGitActions } from '@/composables/useGitActions'
import { useMachineName } from '@/composables/useMachineName'
import { useSessionBranch } from '@/composables/useSessionBranch'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import type { EditorApp } from '@/ipc/bindings/EditorApp'
import { filesOpenEditor } from '@/ipc/files'
import { projectReveal } from '@/ipc/project'
import { type TaskState, type ToolItem, useConversationsStore } from '@/stores/conversations'
import { useFilesStore } from '@/stores/files'
import { useGeneralStore } from '@/stores/general'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'
import { contextFormats, contextRatio, contextRows } from '@/utils/context'
import { formatDuration } from '@/utils/duration'
import { contextTone } from '@/utils/level'
import { tasksOf } from '@/utils/tasks'

// Résumé de la session active, sur le modèle du panneau de détails de T3 Code : en haut une ligne par action de tous
// les jours, en bas les détails repliés.
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const { chat } = useTerminalChat()
const { phase, idle, git, changed, run, main, others, initRepo, start } = useGitActions()
const STOP = '[data-git-run="session"] [data-git-stop]'
const { focusView } = useDockFocus()
const projects = useProjectsStore()
const worktrees = useWorktreesStore()
const conversations = useConversationsStore()
const toasts = useToastsStore()
const machine = useMachineName()
const layout = useLayoutStore()
const general = useGeneralStore()
const files = useFilesStore()
files.loadEditors()

// Détails repliés par défaut, état retenu en local : simple confort, rien de grave si la lecture échoue.
const OPEN_KEY = 'nuee.sessionPanel.v4'
const groups = ['place', 'context', 'tasks', 'options'] as const
type Group = (typeof groups)[number]
const open = reactive<Record<Group, boolean>>(Object.fromEntries(groups.map((name) => [name, false])) as Record<Group, boolean>)
try {
  const saved: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
  if (saved && typeof saved === 'object')
    for (const name of groups) {
      const value = (saved as Record<string, unknown>)[name]
      if (typeof value === 'boolean') open[name] = value
    }
} catch {
  // Valeurs par défaut.
}
watch(open, (value) => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(value))
  } catch {
    // Stockage indisponible : l'état reste valable jusqu'à la fermeture.
  }
})

const project = computed(() => projects.byId(chat.value?.projectId ?? null))
const folder = computed(() => {
  const tab = chat.value
  if (!project.value || !tab) return null
  return tab.worktree ? tab.worktreePath : project.value.path
})
// Chemin coupé par le milieu s'il est trop long : le nom du dossier reste lisible en entier. Il n'est omis que s'il
// répète le nom du projet, écrit en tête.
const folderParts = computed(() => {
  const path = folder.value
  if (!path) return null
  const cut = Math.max(path.lastIndexOf('/', path.length - 2), path.lastIndexOf('\\', path.length - 2)) + 1
  const tail = path.slice(cut)
  const repeated = !chat.value?.worktree && tail.replace(/[/\\]$/, '') === project.value?.name
  return { head: path.slice(0, cut), tail: repeated ? null : tail }
})
const items = computed(() => (chat.value ? (conversations.find(chat.value.id)?.items ?? []) : []))

// Le panneau s'ouvre par-dessus le reste : ce qui mène à un volet le referme, et le clavier y suit.
function toDock(view: DockView, event: MouseEvent, path?: string) {
  if (view === 'changes') layout.showChanges(path ?? null)
  else layout.showView(view)
  emit('close')
  if (event.detail === 0) focusView(view)
}

// ===== Éditeur et Finder =====

async function openIn(app: EditorApp) {
  const tab = chat.value
  if (!tab || !project.value) return
  try {
    await filesOpenEditor({ chatId: tab.id, path: project.value.path, worktree: tab.worktree ? tab.worktreePath : null }, '', app.id)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('dock.files.openFailed', { editor: app.name }), body: isAppError(error) ? error.message : String(error) })
  }
}

async function reveal() {
  if (!folder.value) return
  try {
    await projectReveal(folder.value)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.revealFailed'), body: isAppError(error) ? error.message : String(error) })
  }
}

// ===== Branche =====

// Dossier du projet pas encore suivi par git, comme T3 Code : une seule ligne « Initialiser Git » à la place de la
// partie git. Relu en fin de tour : l'agent vient peut-être de créer le dépôt, la branche reprend alors sa place.
const notRepo = computed(() => !!project.value && !chat.value?.worktree && projects.support[project.value.id] === 'notRepo')
async function checkRepo() {
  const current = project.value
  if (!current) return
  const before = projects.support[current.id]
  await projects.checkWorktree(current)
  if (before === 'notRepo' && projects.support[current.id] !== 'notRepo') worktrees.load(current)
}
watch(() => project.value?.id, checkRepo, { immediate: true })
watch(phase, (value, previous) => {
  if (value === 'idle' && previous && previous !== 'idle') checkRepo()
})
// Initialiser Git a pu aboutir dans sa session de fond.
watch(
  () => !!run.value,
  (running, was) => {
    if (was && !running) checkRepo()
  },
)

const { branch, canSwitch, branchList, loadBranches, checkout } = useSessionBranch()

// ===== Contexte =====

const context = computed(() => (chat.value ? (conversations.find(chat.value.id)?.context ?? null) : null))
const formats = computed(() => contextFormats(locale.value))
const ratio = computed(() => (context.value ? contextRatio(context.value) : 0))
const percent = computed(() => formats.value.percent.format(ratio.value))
const tone = computed(() => contextTone(ratio.value))
const categories = computed(() => {
  if (!context.value) return []
  const rows = contextRows(context.value, formats.value)
  return [...rows.filled, ...rows.free, ...rows.deferred]
})

// ===== Tâches =====

const tasks = computed(() => tasksOf(items.value))
const running = computed(() => tasks.value.filter(({ task }) => task.status === 'running'))
const finished = computed(() => tasks.value.length - running.value.length)
const taskName = (tool: ToolItem, task: TaskState) => task.description ?? tool.detail?.description ?? tool.summary ?? tool.name
// Durée des tâches en cours : l'horloge ne tourne que s'il y en a une.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
watch(
  () => running.value.length > 0,
  (active) => {
    clearInterval(ticker)
    if (active) ticker = setInterval(() => (now.value = Date.now()), 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(ticker))

const row = 'flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-start text-[13px]'
const action = `${row} hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`
const empty = `${row} text-muted`
const icon = 'size-4 shrink-0 text-muted'
const separator = 'mx-2 my-1 h-px shrink-0 bg-stroke'
</script>

<template>
  <div v-if="chat?.started" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
    <div class="flex flex-col gap-0.5">
      <button type="button" :class="action" :aria-expanded="open.place" @click="open.place = !open.place">
        <ProjectIcon v-if="project" :project="project" class="size-4 shrink-0 rounded-sm" />
        <NoProject v-else :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ project?.name ?? t('rail.chats') }}</span>
        <ChevronDown :class="[icon, { 'rotate-180': open.place }]" aria-hidden="true" />
      </button>
      <!-- Où travaille l'agent. Seule cette machine pour l'instant : l'hôte SSH, annoncé dans `ChatHostPicker`, prendra
           cette ligne avec son nom quand il sera branché. -->
      <dl v-if="open.place" class="flex flex-col gap-0.5">
        <div :class="row">
          <dt class="sr-only">{{ t('dock.session.host') }}</dt>
          <dd class="flex min-w-0 flex-1 items-center gap-2.5">
            <NoProject :class="icon" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ machine || t('composer.hosts.local') }}</span>
          </dd>
          <dd class="shrink-0 text-xs text-muted">{{ t('dock.session.local') }}</dd>
        </div>
        <div v-if="folder && folderParts" :class="row" :title="folder">
          <dt class="sr-only">{{ t('dock.session.folder') }}</dt>
          <dd class="flex min-w-0 flex-1 items-center gap-2.5">
            <component :is="chat.worktree ? FolderTree : Folder" :class="icon" aria-hidden="true" />
            <span class="flex min-w-0 flex-1" dir="ltr">
              <span class="min-w-0 truncate text-muted">{{ folderParts.head }}</span>
              <span v-if="folderParts.tail" class="max-w-full shrink-0 truncate">{{ folderParts.tail }}</span>
            </span>
          </dd>
          <dd v-if="chat.worktree" class="shrink-0 text-xs text-muted">{{ t('composer.worktree.short') }}</dd>
        </div>
      </dl>

      <template v-if="folder">
        <ChatSessionSub>
          <ExternalLink :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ t('dock.session.openIn') }}</span>
          <template #menu>
            <DropdownMenuItem v-for="app in files.editors ?? []" :key="app.id" :text-value="app.name" :class="[menuRow, 'py-1']" @select="openIn(app)">
              <img v-if="app.icon" :src="app.icon" alt="" draggable="false" :class="menuIcon" />
              <ExternalLink v-else :class="menuIcon" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ app.name }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem :text-value="t('dock.session.finder')" :class="[menuRow, 'py-1']" @select="reveal">
              <img v-if="files.finderIcon" :src="files.finderIcon" alt="" draggable="false" :class="menuIcon" />
              <FolderOpen v-else :class="menuIcon" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('dock.session.finder') }}</span>
            </DropdownMenuItem>
          </template>
        </ChatSessionSub>
        <ServerMenu row />
      </template>
    </div>

    <template v-if="project && notRepo">
      <div :class="separator" aria-hidden="true" />
      <div data-git-run="session">
        <ChatGitRun v-if="run" :run="run" />
        <button v-else type="button" :class="action" @click="start(initRepo.id, $event.detail === 0, STOP)">
          <GitBranchPlus :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ initRepo.label }}</span>
          <span v-if="initRepo.hint" class="shrink-0 text-xs text-muted">{{ initRepo.hint }}</span>
        </button>
      </div>
    </template>
    <template v-else-if="project">
      <div :class="separator" aria-hidden="true" />
      <div class="flex flex-col gap-0.5">
        <ChatSessionSub v-if="canSwitch" :label="`${t('composer.branch.label')} ${branch}`" :disabled="!idle || !!run" @open="loadBranches">
          <GitBranch :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ branch }}</span>
          <template #menu>
            <DropdownMenuItem
              v-for="item in branchList"
              :key="item.name"
              :text-value="item.name"
              :disabled="item.name === branch"
              :class="[menuRow, 'py-1 data-[disabled]:opacity-100!']"
              @select="checkout(item.name)"
            >
              <GitBranch :class="[menuIcon, 'text-muted']" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1', { 'text-muted': item.name === branch }]">{{ item.name }}</span>
              <span v-if="item.name === branch" class="mt-0.5 shrink-0 text-[11px] leading-4 text-muted">{{ t('dock.session.current') }}</span>
            </DropdownMenuItem>
          </template>
        </ChatSessionSub>
        <p v-else :class="branch ? row : empty">
          <GitBranch :class="icon" aria-hidden="true" />
          <span class="sr-only">{{ t('composer.branch.label') }}</span>
          <span class="min-w-0 flex-1 truncate">{{ branch ?? t('dock.session.noBranch') }}</span>
        </p>

        <div data-git-run="session">
          <ChatGitRun v-if="run" :run="run" />
          <ChatSessionSub
            v-else-if="others.length"
            split
            :menu-label="t('dock.session.gitActions')"
            :run-disabled="main.disabled"
            @run="start(main.id, $event.detail === 0, STOP)"
          >
            <component :is="main.icon" :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ main.label }}</span>
            <span v-if="main.hint" class="max-w-32 shrink-0 truncate text-xs text-muted">{{ main.hint }}</span>
            <template #menu="{ keyboard }">
              <UiMenuItem
                v-for="item in others"
                :key="item.id"
                :label="item.label"
                :icon="item.icon"
                :hint="item.hint"
                :disabled="item.disabled"
                @select="start(item.id, keyboard, STOP)"
              />
            </template>
          </ChatSessionSub>
          <button v-else type="button" :class="[action, 'disabled:text-muted disabled:hover:bg-transparent']" :disabled="main.disabled" @click="start(main.id, $event.detail === 0, STOP)">
            <component :is="main.icon" :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ main.label }}</span>
            <span v-if="main.hint" class="max-w-32 shrink-0 truncate text-xs text-muted">{{ main.hint }}</span>
          </button>
        </div>

        <button type="button" :class="action" @click="toDock('changes', $event)">
          <GitCompare :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ t('dock.changes.title') }}</span>
          <ChatDiffStat v-if="git && changed" :added="git.changes.added" :removed="git.changes.removed" plain class="text-xs" />
        </button>
      </div>
    </template>

    <div :class="separator" aria-hidden="true" />
    <div class="flex flex-col gap-0.5">
      <!-- Comme l'app Claude : la jauge reste sur la ligne repliée. -->
      <button type="button" :class="action" :aria-expanded="open.context" @click="open.context = !open.context">
        <Gauge :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.session.context') }}</span>
        <template v-if="context">
          <span class="text-xs tabular-nums" :class="tone.text">{{ percent }}</span>
          <span class="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
            <span class="block h-full rounded-full" :class="tone.bar" :style="{ width: `${ratio * 100}%` }" />
          </span>
        </template>
        <ChevronDown :class="[icon, { 'rotate-180': open.context }]" aria-hidden="true" />
      </button>
      <template v-if="open.context">
        <ul v-if="context" class="flex flex-col gap-1.5 px-2 pt-1 pb-2 text-xs">
          <li v-for="item in categories" :key="item.name" class="flex items-center gap-2" :class="{ 'text-muted': item.kind === 'deferred' }">
            <span class="size-2.5 shrink-0 rounded-sm" :class="item.color" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span class="text-muted tabular-nums">{{ formats.tokens.format(item.tokens) }}</span>
            <span class="w-12 text-end tabular-nums">{{ item.share }}</span>
          </li>
        </ul>
        <p v-else :class="empty">{{ t('dock.session.noContext') }}</p>
      </template>

      <button type="button" :class="action" :aria-expanded="open.tasks" @click="open.tasks = !open.tasks">
        <Layers :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.tasks.title') }}</span>
        <span v-if="running.length" class="text-xs text-muted">{{ t('dock.session.running', { n: running.length }, running.length) }}</span>
        <ChevronDown :class="[icon, { 'rotate-180': open.tasks }]" aria-hidden="true" />
      </button>
      <template v-if="open.tasks">
        <!-- Comme l'app Claude : les tâches en cours avec leur durée et ■, un clic mène au volet Tâches. -->
        <div v-for="{ tool, task } in running" :key="task.id" class="flex items-center gap-1">
          <button type="button" :class="[action, 'min-w-0 flex-1']" :title="taskName(tool, task)" @click="toDock('tasks', $event)">
            <component :is="task.kind === 'command' ? SquareTerminal : Bot" :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ taskName(tool, task) }}</span>
            <span v-if="task.startedAt" class="shrink-0 text-muted tabular-nums">{{ formatDuration(now - task.startedAt, locale) }}</span>
          </button>
          <UiIconButton :label="t('dock.tasks.stop')" class="size-6!" @click="conversations.stopTask(chat.id, task.id)">
            <Square class="size-3" aria-hidden="true" />
          </UiIconButton>
        </div>
        <button v-if="finished" type="button" :class="[action, 'text-muted']" @click="toDock('tasks', $event)">
          <span class="size-4 shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ t('dock.session.finished', { n: finished }, finished) }}</span>
        </button>
        <p v-if="!tasks.length" :class="empty">{{ t('dock.session.noTasks') }}</p>
      </template>

      <button type="button" :class="action" :aria-expanded="open.options" @click="open.options = !open.options">
        <SlidersHorizontal :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.session.options') }}</span>
        <ChevronDown :class="[icon, { 'rotate-180': open.options }]" aria-hidden="true" />
      </button>
      <template v-if="open.options">
        <!-- Le même réglage que Réglages › Général, raccourci ici comme dans l'app Claude : il vaut pour toute l'app.
             L'infobulle sur l'interrupteur seul, posée sur une enveloppe : elle écraserait son `data-state`. -->
        <div :class="row">
          <Coffee :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate" aria-hidden="true">{{ t('dock.session.keepAwake') }}</span>
          <UiTooltip :label="t('dock.session.keepAwakeHelp')" side="bottom">
            <span class="flex">
              <UiSwitch v-model="general.keepAwake" :label="t('settings.general.system.keepAwake')" />
            </span>
          </UiTooltip>
        </div>
        <UiTooltip :label="t('dock.session.soon')" side="bottom">
          <div :class="row">
            <RemoteControl :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-muted" aria-hidden="true">{{ t('dock.session.remoteControl') }}</span>
            <UiSwitch :model-value="false" :label="`${t('dock.session.remoteControl')} · ${t('dock.session.soon')}`" disabled class="pointer-events-none" />
          </div>
        </UiTooltip>
      </template>
    </div>
  </div>
  <p v-else class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.session.empty') }}</p>
</template>
