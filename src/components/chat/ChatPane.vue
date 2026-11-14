<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatApproval from '@/components/chat/ChatApproval.vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatLimit from '@/components/chat/ChatLimit.vue'
import ChatLimitSoon from '@/components/chat/ChatLimitSoon.vue'
import ChatPlaceInfo from '@/components/chat/ChatPlaceInfo.vue'
import ChatPlaceRow from '@/components/chat/ChatPlaceRow.vue'
import type { WorktreeChoice } from '@/components/chat/ChatWorktreePicker.vue'
import ChatQuestion from '@/components/chat/ChatQuestion.vue'
import ChatQueue from '@/components/chat/ChatQueue.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useComposerLaunch } from '@/composables/useComposerLaunch'
import { useFileDrop } from '@/composables/useFileDrop'
import { useSlow } from '@/composables/useSlow'
import { isAppError } from '@/ipc/agent'
import { worktreeCheckout } from '@/ipc/worktree'
import { useCatalogStore } from '@/stores/catalog'
import { codeRunPlaceKey } from '@/stores/codeRuns'
import { useDialogStore } from '@/stores/dialog'
import { useDraftsStore } from '@/stores/drafts'
import { useNavigationStore } from '@/stores/navigation'
import { useOperatorStore } from '@/stores/operator'
import { mentionPlaceKey } from '@/stores/mentions'
import { useToastsStore } from '@/stores/toasts'
import { lastTurnItem, type Place, useConversationsStore } from '@/stores/conversations'
import type { Attachment } from '@/ipc/bindings/Attachment'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { agents } from '@/utils/agents'

const props = defineProps<{ tab: Tab }>()

const { t, tm } = useI18n()
// Accueil tiré de l'id de la session : la même phrase à chaque retour sur elle, une autre d'une session à l'autre.
const seed = computed(() => {
  let hash = 0
  for (const char of props.tab.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
})
function pick(key: string) {
  const count = (tm(key) as unknown[]).length
  return `${key}.${seed.value % count}`
}
const projects = useProjectsStore()
const conversations = useConversationsStore()
const catalog = useCatalogStore()
const workspace = useWorkspaceStore()
const navigation = useNavigationStore()
// Session vierge seule à l'écran : c'est « Nouvel espace de travail », le projet s'y choisit. En changer ouvre une
// session vierge dans l'autre projet.
// Toute session vierge laisse choisir son projet, sur le projet affiché par défaut, comme l'app Claude.
const pickProject = computed(() => !props.tab.started && workspace.panes.length < 2 && navigation.view === 'chats')
const context = computed({
  get: () => navigation.projectId ?? '',
  set: (id: string) => {
    navigation.projectId = id || null
    navigation.go('new')
  },
})
const worktrees = useWorktreesStore()
const dialog = useDialogStore()
const toasts = useToastsStore()
const operator = useOperatorStore()

// Le pane est recréé à chaque changement d'onglet (:key), l'historique se charge donc ici.
conversations.open(props.tab.id, props.tab.agent, props.tab.projectId)
catalog.load(props.tab.agent)

const project = computed(() => projects.byId(props.tab.projectId))
provide(
  mentionPlaceKey,
  computed(() => (project.value ? { chatId: props.tab.id, project: project.value.path } : null)),
)
const conversation = computed(() => conversations.find(props.tab.id))
const items = computed(() => conversation.value?.items ?? [])
const answering = computed(() => conversation.value?.phase === 'answering')
// Une réponse est attendue : l'agent répond, ou un message attend la fin du tour précédent.
const waiting = computed(() => answering.value || (conversation.value?.phase === 'finishing' && !!conversation.value.queue.length))
const loaded = computed(() => conversation.value?.loaded ?? false)
// Une session vierge n'a pas d'historique à lire : rien à attendre, pas de squelette.
const slowHistory = useSlow(() => !loaded.value && props.tab.started)
// Bandeau de limite tant que le dernier tour s'est arrêté sur elle.
const limit = computed(() => {
  const current = conversation.value
  const last = current && lastTurnItem(current.items)
  return current?.limited && current.phase === 'idle' && last?.kind === 'end' && last.status === 'failed' ? current.limited : null
})
const agent = computed(() => props.tab.agent)
const options = computed({
  get: () => catalog.resolve(agent.value, conversation.value?.options ?? projects.chatOptions(props.tab.projectId, agent.value)),
  set: (value) => conversations.setOptions(props.tab.id, value),
})

const cwd = computed(() => project.value?.path ?? null)
const approval = computed(() => conversation.value?.approvals[0] ?? null)
const clock = computed(() => {
  const current = conversation.value
  return current?.startedAt
    ? { since: current.startedAt, pausedMs: current.pausedMs, pausedAt: current.pausedAt, asking: !!current.approvals[0]?.questions }
    : null
})

// Le worktree se choisit jusqu'au premier message. D'ici là, un dossier hors git (ou git absent) le coupe.
const started = computed(() => props.tab.started || items.value.some((item) => item.kind === 'user'))
if (project.value && !started.value) projects.checkWorktree(project.value)
if (project.value) worktrees.ensure(project.value)
const support = computed(() => (project.value ? projects.support[project.value.id] : undefined))
const blocked = computed(() => (support.value && support.value !== 'ready' ? support.value : null))
const worktree = computed(() => !!project.value && props.tab.worktree && (started.value || !blocked.value))
// La branche de départ ne sert qu'à créer son propre worktree, au premier message.
const base = computed(() => worktrees.bases[props.tab.id] ?? null)
const place = computed<Place>(() => ({
  cwd: cwd.value,
  worktree: worktree.value,
  worktreePath: worktree.value ? props.tab.worktreePath : null,
  worktreeBase: worktree.value && !props.tab.worktreePath ? base.value : null,
}))
provide(
  codeRunPlaceKey,
  computed(() => ({ chatId: props.tab.id, place: place.value })),
)

const worktreeState = computed<WorktreeChoice | null>(() =>
  project.value
    ? {
        choice: worktree.value ? (props.tab.worktreePath ?? 'new') : 'project',
        blocked: blocked.value,
        trees: (worktrees.lists[project.value.id] ?? []).filter((tree) => !tree.main && tree.state !== 'missing'),
        current: worktrees.lists[project.value.id]?.find((tree) => tree.main)?.branch ?? null,
        base: base.value,
      }
    : null,
)

function chooseWorktree(choice: string) {
  if (choice === 'project') workspace.setWorktree(props.tab.id, false)
  else workspace.setWorktree(props.tab.id, true, choice === 'new' ? null : choice)
}

async function checkout(branch: string) {
  if (!project.value) return
  try {
    await worktreeCheckout(project.value.path, branch)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('composer.branch.checkoutFailed'), body: isAppError(error) ? error.message : String(error) })
  }
  await worktrees.load(project.value)
}

const launch = useComposerLaunch()

// État git de la session (ligne de commit d'Environnement, point sur son bouton), relu entre deux tours et au retour
// de la fenêtre : un commit fait hors de Nuée s'y voit.
const sessionGit = useSessionGitStore()
const idle = computed(() => loaded.value && conversation.value?.phase === 'idle')
function refreshGit() {
  if (idle.value && started.value && project.value) sessionGit.refresh(props.tab.id, project.value.path)
}
watch([idle, started, () => project.value?.path, () => props.tab.worktreePath], refreshGit, { immediate: true })
onMounted(() => window.addEventListener('focus', refreshGit))
onBeforeUnmount(() => window.removeEventListener('focus', refreshGit))

function send(prompt: string, attachments: Attachment[], other = false) {
  operator.userSpoke(props.tab.id)
  const first = !items.value.some((item) => item.kind === 'user')
  if (first) {
    workspace.setWorktree(props.tab.id, worktree.value, props.tab.worktreePath)
    workspace.startChat(props.tab.id, prompt, attachments)
  }
  conversations.send(props.tab.id, place.value, prompt, attachments, other)
  if (first) {
    worktrees.setBase(props.tab.id, null)
    // Après les changements d'état : l'arrivée se lit une fois leur rendu fait, le DOM n'a pas encore bougé.
    launch(props.tab.id)
  }
}

// Lu à la frappe d'une flèche seulement : une liste calculée serait refaite à chaque image d'une réponse en cours.
const sent = () =>
  items.value.flatMap((item) => (item.kind === 'user' && item.text ? [{ text: item.text, attachments: item.attachments ?? [] }] : []))

// Après une connexion refaite : le dernier message repart tel quel, pièces jointes comprises.
function resend() {
  const last = [...items.value].reverse().find((item) => item.kind === 'user' || (item.kind === 'compact' && !item.auto))
  if (last?.kind === 'compact') send('/compact', [])
  else if (last?.kind === 'user') send(last.text, last.attachments ?? [])
  else return
  // Le bouton disparaît avec le tour qui démarre : le focus va au champ plutôt qu'à la page.
  composer.value?.focus()
}

// La suite de la conversation disparaît, côté agent comme à l'écran : on demande d'abord.
async function rewindTo(itemId: string) {
  const confirmed = await dialog.confirm({
    title: t('chat.rewind.title'),
    message: t('chat.rewind.message', { agent: agents[agent.value].name }),
    confirmLabel: t('chat.rewind.confirm'),
    danger: true,
  })
  if (!confirmed) return
  try {
    const result = await conversations.rewind(props.tab.id, place.value, itemId)
    if (!result) return
    composer.value?.fill(result.prefill, result.attachments)
    const body = result.filesError
      ? t('chat.rewind.filesKept', { detail: result.filesError })
      : t('chat.rewind.files', { n: result.files.length }, result.files.length)
    toasts.push({ kind: result.filesError ? 'error' : 'success', title: t('chat.rewind.done'), body })
  } catch (error) {
    toasts.push({ kind: 'error', title: t('chat.rewind.failed'), body: isAppError(error) ? error.message : String(error) })
  }
}

const pane = useTemplateRef('pane')
const composer = useTemplateRef('composer')
const { over } = useFileDrop(pane, (paths) => {
  if (loaded.value) composer.value?.attach(paths)
})

defineExpose({ focus: () => composer.value?.focus() })

const drafts = useDraftsStore()
// Passe par `send` : un premier message lance la session comme depuis le champ.
watch(
  [() => drafts.requested, loaded],
  ([requested, ready]) => {
    if (!requested || !ready || requested.chatId !== props.tab.id) return
    drafts.requested = null
    send(requested.text, [])
  },
  { immediate: true },
)
watch(
  [() => drafts.attachRequested, loaded],
  ([requested, ready]) => {
    if (!requested || !ready || requested.chatId !== props.tab.id) return
    drafts.attachRequested = null
    composer.value?.attach(requested.paths)
  },
  { immediate: true },
)

// Chat de skill qui attend la réponse à son formulaire : il vient d'être ouvert pour qu'on y écrive.
onMounted(() => {
  if (loaded.value && items.value.length === 1 && items.value[0]?.kind === 'command') composer.value?.focus()
})
</script>

<template>
  <!-- Le champ reste le même élément quand la conversation démarre : il garde le focus. -->
  <div ref="pane" class="relative flex flex-col" data-chat-pane>
    <ChatTranscript
      v-if="items.length"
      :items="items"
      :running="waiting"
      :agent="agent"
      :clock="clock"
      :title="tab.title"
      :parent-id="tab.background ? null : tab.parentId"
      class="min-h-0 flex-1"
      @rewind="rewindTo"
      @resend="resend"
      :typing="!!drafts.get(tab.id)?.text.trim()"
      :active="workspace.activeTabId === tab.id"
      @reply="send($event, [])"
    />
    <!-- Même en-tête que Nouvel espace de travail : titre, puis projet, machine et endroit juste au-dessus du champ. -->
    <div v-else-if="loaded" class="flex flex-1 flex-col items-center justify-end px-6 pb-2">
      <div class="w-full max-w-(--chat-width)">
        <slot name="title">
          <h1 class="px-1 text-2xl font-semibold tracking-tight text-balance break-words">
            {{ t(pick(workspace.workspaceChat === tab.id ? 'chat.workspaceTitles' : 'chat.sessionTitles')) }}
          </h1>
        </slot>
        <ChatPlaceRow
          class="mt-5"
          :chat-id="tab.id"
          :project="project"
          :worktree="worktreeState"
          @worktree="chooseWorktree"
          @base="worktrees.setBase(tab.id, $event)"
          @checkout="checkout"
        >
          <template v-if="$slots.project" #project><slot name="project" /></template>
          <template v-else-if="pickProject" #project>
            <UiTooltip :label="t('composer.project')">
              <span class="flex min-w-0">
                <ProjectPicker v-model="context" badge :label="t('rail.switchProject')" :none-label="t('rail.chats')" />
              </span>
            </UiTooltip>
          </template>
        </ChatPlaceRow>
      </div>
    </div>
    <UiSkeleton v-else-if="slowHistory" :label="t('chat.transcriptLoading')" kind="chat" :rows="3" class="min-h-0 flex-1 justify-end overflow-hidden" />
    <div v-else class="flex-1" />
    <!-- La demande s'affiche au-dessus du champ sans le démonter : un brouillon en cours reste. Session commencée pas
         encore chargée : le champ est déjà en bas, sinon il passait par le milieu de l'écran le temps de la lecture. -->
    <div class="flex flex-col items-center gap-2 px-6" :class="items.length || tab.started ? 'pb-4' : 'flex-1 justify-start pb-16'">
      <!-- Au-dessus du champ, à pleine largeur, au cadre des cartes du fil (demande de Jérémy). -->
      <ChatQuestion
        v-if="approval?.questions"
        :key="approval.id"
        class="card-in w-full max-w-(--chat-width)"
        :questions="approval.questions"
        @answer="conversations.answer(tab.id, approval.id, $event)"
      />
      <ChatApproval
        v-else-if="approval"
        :key="approval.id"
        class="card-in w-full max-w-(--chat-width)"
        :approval="approval"
        :agent-name="agents[agent].name"
        @answer="conversations.approve(tab.id, approval.id, $event)"
      />
      <ChatLimit
        v-if="limit"
        class="card-in w-full max-w-(--chat-width)"
        :resets-at="limit.resetsAt"
        :resume-at="conversation?.resumeAt ?? null"
        @schedule="conversations.scheduleResume(tab.id)"
        @cancel="conversations.cancelResume(tab.id)"
      />
      <ChatLimitSoon v-if="!limit && items.length" class="w-full max-w-(--chat-width)" :agent="agent" />
      <ChatQueue
        v-if="conversation?.queue.length"
        class="w-full max-w-(--chat-width)"
        :queue="conversation.queue"
        :answering="answering"
        @send="conversations.sendNow(tab.id, $event)"
        @remove="conversations.unqueue(tab.id, $event)"
      />
      <div v-if="started && project" class="flex w-full max-w-(--chat-width) justify-end">
        <ChatPlaceInfo :tab="tab" />
      </div>
      <ChatComposer
        ref="composer"
        class="w-full max-w-(--chat-width)"
        :chat-id="tab.id"
        v-model:options="options"
        :agent="agent"
        :project="project"
        :catalog="catalog.get(agent)"
        :context="conversation?.context ?? null"
        :compactable="items.some((item) => item.kind === 'user')"
        :sent="sent"
        :disabled="!loaded"
        :running="answering"
        :approving="!!approval"
        @send="send"
        @warm="conversations.warm(tab.id, place)"
        @stop="conversations.stop(tab.id)"
        @compact="send('/compact', [])"
      />
    </div>
    <div
      v-if="over"
      class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-ring bg-canvas/70 text-sm"
    >
      {{ t('chat.dropFiles') }}
    </div>
  </div>
</template>
