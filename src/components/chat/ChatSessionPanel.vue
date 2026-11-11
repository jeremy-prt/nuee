<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Coffee,
  ExternalLink,
  FileDiff,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCommit,
  Layers,
  NoProject,
  RemoteControl,
  SlidersHorizontal,
  Square,
  SquareTerminal,
} from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { type Component, computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSessionSplit from '@/components/chat/ChatSessionSplit.vue'
import ServerMenu from '@/components/server/ServerMenu.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuIcon, menuLabel, menuPanel, menuRow, menuTitle } from '@/components/ui/menuRow'
import { useCommitRequest } from '@/composables/useCommitRequest'
import { useDockFocus } from '@/composables/useDockFocus'
import { useMachineName } from '@/composables/useMachineName'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import type { Branch } from '@/ipc/bindings/Branch'
import type { EditorApp } from '@/ipc/bindings/EditorApp'
import { filesOpenEditor } from '@/ipc/files'
import { projectReveal } from '@/ipc/project'
import { worktreeCheckout, worktreeRefs } from '@/ipc/worktree'
import { type TaskState, type ToolItem, useConversationsStore } from '@/stores/conversations'
import { useFilesStore } from '@/stores/files'
import { useGeneralStore } from '@/stores/general'
import { type DockView, useLayoutStore } from '@/stores/layout'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'
import { contextFormats, contextRatio, contextRows } from '@/utils/context'
import { formatDuration } from '@/utils/duration'
import { tasksOf } from '@/utils/tasks'

// Résumé de la session active, sur le modèle du panneau de détails de T3 Code : en haut une ligne par action de tous
// les jours, en bas les détails repliés.
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const { chat } = useTerminalChat()
const { phase, commitAndPush, commitOnly, push } = useCommitRequest()
const { focusView } = useDockFocus()
const projects = useProjectsStore()
const worktrees = useWorktreesStore()
const conversations = useConversationsStore()
const sessionGit = useSessionGitStore()
const toasts = useToastsStore()
const machine = useMachineName()
const layout = useLayoutStore()
const general = useGeneralStore()
const files = useFilesStore()
files.loadEditors()

// Détails repliés par défaut, état retenu en local : simple confort, rien de grave si la lecture échoue.
const OPEN_KEY = 'nuee.sessionPanel.v4'
const groups = ['context', 'tasks', 'options'] as const
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
const branch = computed(() => (chat.value ? worktrees.branchOf(chat.value) : null))
const folder = computed(() => {
  const tab = chat.value
  if (!project.value || !tab) return null
  return tab.worktree ? tab.worktreePath : project.value.path
})
const folderLabel = computed(() => folder.value?.split(/[\\/]/).filter(Boolean).pop() ?? null)
const items = computed(() => (chat.value ? (conversations.find(chat.value.id)?.items ?? []) : []))
const idle = computed(() => phase.value === 'idle')

// Le panneau s'ouvre par-dessus le reste : ce qui mène à un volet le referme, et le clavier y suit.
function toDock(view: DockView, event: MouseEvent, path?: string) {
  if (view === 'changes') layout.showChanges(path ?? null)
  else layout.showView(view)
  emit('close')
  if (event.detail === 0) focusView(view)
}

// ===== Éditeur et Finder =====

// Le dernier éditeur choisi par ⌄ passe en tête, comme dans T3 Code.
const EDITOR_KEY = 'nuee.sessionPanel.editor'
const preferred = ref<string | null>(null)
try {
  preferred.value = localStorage.getItem(EDITOR_KEY)
} catch {
  // Premier éditeur détecté.
}
const editor = computed(() => files.editors?.find((app) => app.id === preferred.value) ?? files.editors?.[0] ?? null)
const otherEditors = computed(() => files.editors?.filter((app) => app.id !== editor.value?.id) ?? [])

async function openIn(app: EditorApp) {
  const tab = chat.value
  if (!tab || !project.value) return
  if (app.id !== editor.value?.id) {
    preferred.value = app.id
    try {
      localStorage.setItem(EDITOR_KEY, app.id)
    } catch {
      // Retenu jusqu'à la fermeture.
    }
  }
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

// Seul le dossier du projet change de branche : un worktree garde la sienne.
const canSwitch = computed(() => !!project.value && !!chat.value && !chat.value.worktree && !!branch.value)
const branches = ref<Branch[]>([])
async function loadBranches(opened: boolean) {
  if (!opened || !chat.value || !project.value) return
  try {
    branches.value = (await worktreeRefs(chat.value.id, project.value.path)).branches
  } catch {
    branches.value = []
  }
}
// Une branche prise par un worktree n'est pas proposée : git refuse de l'extraire ici.
const branchChoices = computed<UiMenuSection>(() => ({
  id: 'branch',
  value: branch.value ?? '',
  options: (branches.value.length ? branches.value : branch.value ? [{ name: branch.value, elsewhere: false }] : [])
    .filter((item) => !item.elsewhere)
    .map((item) => ({ value: item.name, label: item.name, icon: GitBranch })),
}))
async function checkout(name: string) {
  const tab = chat.value
  const current = project.value
  if (!tab || !current || name === branch.value) return
  try {
    await worktreeCheckout(current.path, name)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('composer.branch.checkoutFailed'), body: isAppError(error) ? error.message : String(error) })
  }
  await worktrees.load(current)
  sessionGit.refresh(tab.id, current.path)
}

// ===== Commit =====

// État relu par `ChatPane` entre deux tours ; aussi à l'ouverture du panneau, pour un commit fait ailleurs.
watch(
  [() => chat.value?.id, () => chat.value?.started, () => project.value?.path],
  ([id, started, path]) => {
    if (id && started && path && idle.value) sessionGit.refresh(id, path)
  },
  { immediate: true },
)
const git = computed(() => (chat.value ? (sessionGit.states[chat.value.id] ?? null) : null))
const changed = computed(() => (git.value?.changes.files ?? 0) > 0)
const unpushed = computed(() => !!git.value?.unpushed)
const commitLook = computed<{ label: string; icon: Component }>(() => {
  if (changed.value) return { label: t('dock.session.commitPush'), icon: CloudUpload }
  if (unpushed.value) return { label: t('dock.session.push'), icon: CloudUpload }
  return { label: t('dock.session.nothingToCommit'), icon: GitCommit }
})
function runCommit() {
  if (changed.value) commitAndPush()
  else if (unpushed.value) push()
}

// ===== Contexte =====

const context = computed(() => (chat.value ? (conversations.find(chat.value.id)?.context ?? null) : null))
const formats = computed(() => contextFormats(locale.value))
const ratio = computed(() => (context.value ? contextRatio(context.value) : 0))
const percent = computed(() => formats.value.percent.format(ratio.value))
const tone = computed(() => (ratio.value >= 0.9 ? 'bg-danger' : ratio.value >= 0.75 ? 'bg-warning' : 'bg-info'))
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

// Menu non modal : un clic sur sa flèche déjà ouverte le fermait (clic « dehors ») puis le rouvrait aussitôt.
// On retient s'il était ouvert à l'appui, et on refuse alors la réouverture qui suit.
const menuOpen = ref(false)
let pressedOpen = false
function onTriggerDown() {
  pressedOpen = menuOpen.value
  setTimeout(() => (pressedOpen = false), 400)
}
function onMenuOpen(value: boolean) {
  menuOpen.value = value && !pressedOpen
  if (value) pressedOpen = false
}

const row = 'flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-start text-[13px]'
const action = `${row} hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`
const empty = `${row} text-muted`
const icon = 'size-4 shrink-0 text-muted'
const separator = 'mx-2 my-1 h-px shrink-0 bg-stroke'
</script>

<template>
  <div v-if="chat?.started" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
    <div class="flex flex-col gap-0.5">
      <!-- Où travaille l'agent : la machine, puis le dossier du projet ou du worktree. -->
      <p :class="row" :title="folder ?? undefined">
        <NoProject :class="icon" aria-hidden="true" />
        <span class="min-w-0 truncate">
          {{ machine || t('composer.hosts.local') }}<span v-if="folderLabel" class="text-muted"> · {{ folderLabel }}</span>
        </span>
      </p>

      <template v-if="folder">
        <ChatSessionSplit v-if="editor" :menu-label="t('dock.files.openWith')" @run="openIn(editor)">
          <img v-if="editor.icon" :src="editor.icon" alt="" draggable="false" class="size-4 shrink-0" />
          <ExternalLink v-else :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ t('dock.session.openIn', { editor: editor.name }) }}</span>
          <template #menu>
            <DropdownMenuItem v-for="app in otherEditors" :key="app.id" :text-value="app.name" :class="[menuRow, 'py-1.5']" @select="openIn(app)">
              <img v-if="app.icon" :src="app.icon" alt="" draggable="false" :class="menuIcon" />
              <ExternalLink v-else :class="menuIcon" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ app.name }}</span>
            </DropdownMenuItem>
            <UiMenuSeparator v-if="otherEditors.length" />
            <DropdownMenuItem :text-value="t('settings.projects.reveal')" :class="[menuRow, 'py-1.5']" @select="reveal">
              <img v-if="files.finderIcon" :src="files.finderIcon" alt="" draggable="false" :class="menuIcon" />
              <FolderOpen v-else :class="menuIcon" aria-hidden="true" />
              <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('settings.projects.reveal') }}</span>
            </DropdownMenuItem>
          </template>
        </ChatSessionSplit>
        <!-- Aucun éditeur détecté : le Finder seul. -->
        <button v-else-if="files.editors" type="button" :class="action" @click="reveal">
          <img v-if="files.finderIcon" :src="files.finderIcon" alt="" draggable="false" class="size-4 shrink-0" />
          <FolderOpen v-else :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ t('settings.projects.reveal') }}</span>
        </button>
        <ServerMenu row />
      </template>
    </div>

    <template v-if="project">
      <div :class="separator" aria-hidden="true" />
      <div class="flex flex-col gap-0.5">
        <DropdownMenuRoot v-if="canSwitch" :open="menuOpen" :modal="false" @update:open="(value) => (onMenuOpen(value), loadBranches(menuOpen))">
          <DropdownMenuTrigger :class="[action, 'aria-expanded:bg-selection-hover']" :disabled="!idle" @pointerdown="onTriggerDown" :aria-label="`${t('composer.branch.label')} ${branch}`">
            <GitBranch :class="icon" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ branch }}</span>
            <ChevronDown :class="icon" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="start"
              :side-offset="4"
              :collision-padding="8"
              :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-(--reka-dropdown-menu-trigger-width)']"
            >
              <DropdownMenuLabel :class="menuTitle">{{ t('composer.branch.label') }}</DropdownMenuLabel>
              <UiMenuChoices :section="branchChoices" @select="checkout" />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <p v-else :class="branch ? row : empty">
          <GitBranch :class="icon" aria-hidden="true" />
          <span class="sr-only">{{ t('composer.branch.label') }}</span>
          <span class="min-w-0 flex-1 truncate">{{ branch ?? t('dock.session.noBranch') }}</span>
        </p>

        <ChatSessionSplit :menu-label="t('dock.session.gitActions')" :disabled="!idle || (!changed && !unpushed)" :menu-disabled="!idle" @run="runCommit">
          <component :is="commitLook.icon" :class="icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ commitLook.label }}</span>
          <template v-if="changed || unpushed" #menu>
            <UiMenuItem :label="t('dock.session.commitOnly')" :icon="GitCommit" :disabled="!changed" @select="commitOnly" />
            <UiMenuItem :label="t('dock.session.push')" :icon="CloudUpload" :disabled="!unpushed" @select="push" />
          </template>
        </ChatSessionSplit>

        <button type="button" :class="action" @click="toDock('changes', $event)">
          <FileDiff :class="icon" aria-hidden="true" />
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
          <span class="text-xs text-muted tabular-nums">{{ percent }}</span>
          <span class="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
            <span class="block h-full rounded-full" :class="tone" :style="{ width: `${ratio * 100}%` }" />
          </span>
        </template>
        <ChevronRight :class="[icon, { 'rotate-90': open.context }]" aria-hidden="true" />
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
        <ChevronRight :class="[icon, { 'rotate-90': open.tasks }]" aria-hidden="true" />
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
        <ChevronRight :class="[icon, { 'rotate-90': open.options }]" aria-hidden="true" />
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
