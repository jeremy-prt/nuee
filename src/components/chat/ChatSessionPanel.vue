<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  CloudDownload,
  Coffee,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderTree,
  Gauge,
  GitBranch,
  GitBranchPlus,
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
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiMenuToggle from '@/components/ui/UiMenuToggle.vue'
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
import { useLayoutStore } from '@/stores/layout'
import { useGitActionsStore } from '@/stores/gitActions'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
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
const { phase, idle, git, changed, run, commit, push, initRepo, start, runCommit } = useGitActions()
const STOP = '[data-git-run="session"] [data-git-stop]'
const { focusView } = useDockFocus()
const projects = useProjectsStore()
const sessionGit = useSessionGitStore()
const gitActionsStore = useGitActionsStore()
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
const groups = ['place'] as const
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
// Commits à récupérer, relus à l'ouverture du sous-menu git (fetch au plus une fois par minute).
const behind = computed(() => (chat.value ? (sessionGit.behind[chat.value.id] ?? 0) : 0))
function toTasks(keyboard: boolean) {
  layout.showView('tasks')
  emit('close')
  if (keyboard) focusView('tasks')
}
function checkBehind() {
  if (chat.value && project.value) sessionGit.checkBehind(chat.value.id, project.value.path)
}
function pull() {
  if (chat.value) gitActionsStore.pullNow(chat.value)
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
        <button v-else type="button" :class="action" @click="start('initRepo', $event.detail === 0, STOP)">
          <GitBranchPlus :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ initRepo.label }}</span>
        </button>
      </div>
    </template>
    <template v-else-if="project">
      <div :class="separator" aria-hidden="true" />
      <div class="flex flex-col gap-0.5">
        <!-- Tout git sur une ligne, comme T3 Code (demande de Jérémy) : la branche et le total des changements ; au
             survol, changer de branche, les actions git et le volet Git. Une action en cours prend la place de la ligne. -->
        <div data-git-run="session">
          <ChatGitRun v-if="run" :run="run" />
          <ChatSessionSub v-else :label="`${t('composer.branch.label')} ${branch ?? t('dock.session.noBranch')}`" @open="(open) => open && (loadBranches(), checkBehind())">
            <GitBranch :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate" :class="{ 'text-muted': !branch }">{{ branch ?? t('dock.session.noBranch') }}</span>
            <ChatDiffStat v-if="git && changed" :added="git.changes.added" :removed="git.changes.removed" plain class="text-xs" />
            <template #menu="{ keyboard }">
              <UiMenuSub v-if="canSwitch" :label="t('composer.branch.label')" :icon="GitBranch" :value="branch ?? undefined">
                <DropdownMenuItem
                  v-for="item in branchList"
                  :key="item.name"
                  :text-value="item.name"
                  :disabled="item.name === branch || !idle"
                  :class="[menuRow, 'py-1', { 'data-[disabled]:opacity-100!': item.name === branch }]"
                  @select="checkout(item.name)"
                >
                  <GitBranch :class="[menuIcon, 'text-muted']" aria-hidden="true" />
                  <span :class="[menuLabel, 'min-w-0 flex-1', { 'text-muted': item.name === branch }]">{{ item.name }}</span>
                  <span v-if="item.name === branch" class="mt-0.5 shrink-0 text-[11px] leading-4 text-muted">{{ t('dock.session.current') }}</span>
                </DropdownMenuItem>
              </UiMenuSub>
              <UiMenuSeparator v-if="canSwitch" />
              <UiMenuItem :label="commit.label" :icon="commit.icon" :disabled="commit.disabled" @select="runCommit(keyboard, STOP)" />
              <UiMenuItem :label="push.label" :icon="push.icon" :disabled="push.disabled" @select="chat && gitActionsStore.pushNow(chat)" />
              <UiMenuItem :label="t('dock.changes.pull')" :icon="CloudDownload" :hint="behind ? `↓${behind}` : null" :disabled="!idle" @select="pull" />
            </template>
          </ChatSessionSub>
        </div>
      </div>
    </template>

    <div :class="separator" aria-hidden="true" />
    <div class="flex flex-col gap-0.5">
      <!-- Comme les lignes au-dessus (demande de Jérémy) : le détail s'ouvre sur le côté au survol ; la jauge reste
           sur la ligne. -->
      <ChatSessionSub :label="t('dock.session.context')">
        <Gauge :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.session.context') }}</span>
        <template v-if="context">
          <span class="text-xs tabular-nums" :class="tone.text">{{ percent }}</span>
          <span class="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
            <span class="block h-full rounded-full" :class="tone.bar" :style="{ width: `${ratio * 100}%` }" />
          </span>
        </template>
        <template #menu>
          <ul v-if="context" class="flex w-64 flex-col gap-1.5 px-2 py-1.5 text-xs">
            <li v-for="item in categories" :key="item.name" class="flex items-center gap-2" :class="{ 'text-muted': item.kind === 'deferred' }">
              <span class="size-2.5 shrink-0 rounded-sm" :class="item.color" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
              <span class="text-muted tabular-nums">{{ formats.tokens.format(item.tokens) }}</span>
              <span class="w-12 text-end tabular-nums">{{ item.share }}</span>
            </li>
          </ul>
          <p v-else class="px-2 py-1.5 text-xs text-muted">{{ t('dock.session.noContext') }}</p>
        </template>
      </ChatSessionSub>

      <ChatSessionSub :label="t('dock.tasks.title')">
        <Layers :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.tasks.title') }}</span>
        <span v-if="running.length" class="text-xs text-muted">{{ t('dock.session.running', { n: running.length }, running.length) }}</span>
        <template #menu="{ keyboard }">
          <!-- Comme l'app Claude : les tâches en cours avec leur durée et ■, un clic mène au volet Tâches. -->
          <div v-for="{ tool, task } in running" :key="task.id" class="group/row flex items-center gap-1">
            <DropdownMenuItem :text-value="taskName(tool, task)" :class="[menuRow, 'min-w-0 flex-1 py-1']" @select="toTasks(keyboard)">
              <component :is="task.kind === 'command' ? SquareTerminal : Bot" :class="[menuIcon, 'text-muted']" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ taskName(tool, task) }}</span>
              <span v-if="task.startedAt" class="mt-0.5 shrink-0 text-muted tabular-nums">{{ formatDuration(now - task.startedAt, locale) }}</span>
            </DropdownMenuItem>
            <UiIconButton :label="t('dock.tasks.stop')" class="size-6!" @click="conversations.stopTask(chat.id, task.id)">
              <Square class="size-3" aria-hidden="true" />
            </UiIconButton>
          </div>
          <UiMenuItem v-if="finished" :label="t('dock.session.finished', { n: finished }, finished)" @select="toTasks(keyboard)" />
          <p v-if="!tasks.length" class="px-2 py-1.5 text-xs text-muted">{{ t('dock.session.noTasks') }}</p>
        </template>
      </ChatSessionSub>

      <ChatSessionSub :label="t('dock.session.options')">
        <SlidersHorizontal :class="icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ t('dock.session.options') }}</span>
        <template #menu>
          <!-- Le même réglage que Réglages › Général, raccourci ici comme dans l'app Claude : il vaut pour toute l'app. -->
          <UiMenuToggle v-model="general.keepAwake" :label="t('dock.session.keepAwake')" :icon="Coffee" />
          <p class="ps-8.5 pe-2 pb-1 text-[11px] leading-4 text-muted">{{ t('dock.session.keepAwakeHelp') }}</p>
          <UiMenuToggle :model-value="false" :label="`${t('dock.session.remoteControl')} · ${t('dock.session.soon')}`" :icon="RemoteControl" disabled />
        </template>
      </ChatSessionSub>
    </div>
  </div>
  <p v-else class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">{{ t('dock.session.empty') }}</p>
</template>
