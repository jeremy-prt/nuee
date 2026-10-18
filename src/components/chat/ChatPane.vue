<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatApproval from '@/components/chat/ChatApproval.vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatLimit from '@/components/chat/ChatLimit.vue'
import ChatQueue from '@/components/chat/ChatQueue.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import { useFileDrop } from '@/composables/useFileDrop'
import { isAppError } from '@/ipc/agent'
import { useCatalogStore } from '@/stores/catalog'
import { useDialogStore } from '@/stores/dialog'
import { useToastsStore } from '@/stores/toasts'
import { type Place, useConversationsStore } from '@/stores/conversations'
import type { Attachment } from '@/ipc/bindings/Attachment'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { agents } from '@/utils/agents'
import { worktreeBranch } from '@/utils/projects'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const projects = useProjectsStore()
const conversations = useConversationsStore()
const catalog = useCatalogStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const dialog = useDialogStore()
const toasts = useToastsStore()

// Le pane est recréé à chaque changement d'onglet (:key), l'historique se charge donc ici.
conversations.open(props.tab.id, props.tab.agent, props.tab.projectId)
catalog.load(props.tab.agent)

const project = computed(() => projects.byId(props.tab.projectId))
const conversation = computed(() => conversations.find(props.tab.id))
const items = computed(() => conversation.value?.items ?? [])
const answering = computed(() => conversation.value?.phase === 'answering')
// Une réponse est attendue : l'agent répond, ou un message attend la fin du tour précédent.
const waiting = computed(() => answering.value || (conversation.value?.phase === 'finishing' && !!conversation.value.queue.length))
const loaded = computed(() => conversation.value?.loaded ?? false)
// Bandeau de limite tant que le dernier tour s'est arrêté sur elle.
const limit = computed(() => {
  const current = conversation.value
  const last = current?.items.at(-1)
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
  return current?.startedAt ? { since: current.startedAt, pausedMs: current.pausedMs, pausedAt: current.pausedAt } : null
})

// Le worktree se choisit jusqu'au premier message. D'ici là, un dossier hors git (ou git absent) le coupe.
const started = computed(() => props.tab.started || items.value.some((item) => item.kind === 'user'))
if (project.value && !started.value) projects.checkWorktree(project.value)
if (project.value && (!started.value || props.tab.worktree)) worktrees.ensure(project.value)
const support = computed(() => (project.value ? projects.support[project.value.id] : undefined))
const blocked = computed(() => (support.value && support.value !== 'ready' ? support.value : null))
const worktree = computed(() => !!project.value && props.tab.worktree && (started.value || !blocked.value))
const place = computed<Place>(() => ({ cwd: cwd.value, worktree: worktree.value, worktreePath: worktree.value ? props.tab.worktreePath : null }))

// Nom affiché avant que git soit lu : le sien porte la branche tirée de son id, un worktree rejoint celle que git donne.
const branch = computed(() => {
  if (!worktree.value) return ''
  const path = props.tab.worktreePath
  const tree = worktrees.find(props.tab.projectId, path)
  if (tree) return tree.branch ?? tree.path.split(/[\\/]/).pop() ?? ''
  return !path || path.endsWith(props.tab.id) ? worktreeBranch(props.tab.id) : ''
})
const trees = computed(() =>
  (project.value ? (worktrees.lists[project.value.id] ?? []) : []).filter((tree) => !tree.main && tree.state !== 'missing'),
)
const worktreeState = computed(() =>
  project.value
    ? {
        choice: worktree.value ? (props.tab.worktreePath ?? 'new') : 'project',
        started: started.value,
        blocked: blocked.value,
        branch: branch.value,
        trees: trees.value,
      }
    : null,
)

function chooseWorktree(choice: string) {
  if (choice === 'project') workspace.setWorktree(props.tab.id, false)
  else workspace.setWorktree(props.tab.id, true, choice === 'new' ? null : choice)
}

function send(prompt: string, attachments: Attachment[]) {
  if (!items.value.some((item) => item.kind === 'user')) {
    workspace.setWorktree(props.tab.id, worktree.value, props.tab.worktreePath)
    workspace.startChat(props.tab.id, prompt, attachments)
  }
  conversations.send(props.tab.id, place.value, prompt, attachments)
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

// Chat de skill qui attend la réponse à son formulaire : il vient d'être ouvert pour qu'on y écrive.
onMounted(() => {
  if (loaded.value && items.value.length === 1 && items.value[0]?.kind === 'command') composer.value?.focus()
})
</script>

<template>
  <!-- Le champ reste le même élément quand la conversation démarre : il garde le focus. -->
  <div ref="pane" class="relative flex flex-col">
    <ChatTranscript
      v-if="items.length"
      :items="items"
      :running="waiting"
      :agent="agent"
      :clock="clock"
      class="min-h-0 flex-1"
      @rewind="rewindTo"
      @resend="resend"
    />
    <div v-else-if="loaded" class="flex flex-1 flex-col items-center justify-end px-6 pb-8 text-center">
      <p class="text-3xl font-semibold tracking-tight">Nuée</p>
      <p class="mt-2 text-sm text-muted">
        {{
          project
            ? t('chat.ready', { agent: agents[agent].name, project: project.name })
            : t('chat.readyNoProject', { agent: agents[agent].name })
        }}
      </p>
    </div>
    <div v-else class="flex-1" />
    <!-- La demande s'affiche au-dessus du champ sans le démonter : un brouillon en cours reste. -->
    <div class="flex flex-col items-center gap-2 px-6" :class="items.length ? 'pb-4' : 'flex-1 justify-start pb-16'">
      <ChatApproval
        v-if="approval"
        :key="approval.id"
        class="w-full max-w-(--chat-width)"
        :approval="approval"
        :agent-name="agents[agent].name"
        @answer="conversations.approve(tab.id, approval.id, $event)"
      />
      <ChatLimit
        v-if="limit"
        class="w-full max-w-(--chat-width)"
        :resets-at="limit.resetsAt"
        :resume-at="conversation?.resumeAt ?? null"
        @schedule="conversations.scheduleResume(tab.id)"
        @cancel="conversations.cancelResume(tab.id)"
      />
      <ChatQueue
        v-if="conversation?.queue.length"
        class="w-full max-w-(--chat-width)"
        :queue="conversation.queue"
        :answering="answering"
        @send="conversations.sendNow(tab.id, $event)"
        @remove="conversations.unqueue(tab.id, $event)"
      />
      <ChatComposer
        ref="composer"
        class="w-full max-w-(--chat-width)"
        :chat-id="tab.id"
        v-model:options="options"
        :agent="agent"
        :project="project"
        :worktree="worktreeState"
        :catalog="catalog.get(agent)"
        :context="conversation?.context ?? null"
        :compactable="items.some((item) => item.kind === 'user')"
        :sent="sent"
        :disabled="!loaded"
        :running="answering"
        :approving="!!approval"
        @send="send"
        @warm="conversations.warm(tab.id, place)"
        @worktree="chooseWorktree"
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
