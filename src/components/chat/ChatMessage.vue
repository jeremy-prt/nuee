<script setup lang="ts">
import { CircleAlert, CornerDownRight, File, Folder, NotebookPen, Orchestra, TriangleAlert, Undo } from '@/components/ui/icons'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentLogin from '@/components/agent/AgentLogin.vue'
import ChatCommandRow from '@/components/chat/ChatCommandRow.vue'
import ChatCompact from '@/components/chat/ChatCompact.vue'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatPromptText from '@/components/chat/ChatPromptText.vue'
import ChatSkillForm from '@/components/chat/ChatSkillForm.vue'
import ChatSubagent from '@/components/chat/ChatSubagent.vue'
import ChatQuestionRecord from '@/components/chat/ChatQuestionRecord.vue'
import ChatSaveNote from '@/components/chat/ChatSaveNote.vue'
import ChatSessionMessage from '@/components/chat/ChatSessionMessage.vue'
import ChatTaskCard from '@/components/chat/ChatTaskCard.vue'
import ChatTool from '@/components/chat/ChatTool.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { previewSrc } from '@/ipc/attachment'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { useNavigationStore } from '@/stores/navigation'
import { useNotesStore } from '@/stores/notes'
import type { ChatItem } from '@/stores/conversations'
import { START_SESSION } from '@/utils/activity'
import { agents } from '@/utils/agents'
import { formatClock, formatDuration } from '@/utils/duration'

// Un élément de la conversation hors activité groupée. `streaming` : texte que l'agent écrit encore ;
// `afterText` : l'élément précédent est un texte de l'agent ; `answer` : réponse du tour, sur sa ligne de fin.
const props = defineProps<{
  item: ChatItem
  agent: AgentKind
  chatTitle?: string | null
  running: boolean
  streaming: boolean
  afterText: boolean
  answer?: () => string
  // Le message peut servir de point de retour (l'agent l'a enregistré, aucun tour en cours).
  rewindable?: boolean
  // Dernière fin de tour, sans tour en cours : une connexion manquante s'y règle et le message repart.
  latest?: boolean
}>()
const emit = defineEmits<{ rewind: []; resend: [] }>()

// Id de la session lancée, tiré de la réponse de `start_session` (`stores/operator.ts`).
const launched = (output: string | null) => output?.match(/^Session (\S+) lancée/)?.[1] ?? null

// Opacité seule, jamais `display` : le pied garde sa place et la réponse ne bouge pas au survol.
const onHover = 'opacity-0 transition-opacity duration-(--hover-duration) group-hover/answer:opacity-100 group-focus-within/answer:opacity-100 motion-reduce:transition-none'

const { t, locale } = useI18n()
const agentParams = computed(() => ({ agent: agents[props.agent].name, command: agents[props.agent].command }))
const gitDetail = computed(() => {
  const item = props.item
  if (item.kind !== 'git') return null
  if (item.action === 'initRepo') return item.repo
  if (item.action === 'push') return item.branch ?? item.subject
  return item.subject ?? item.branch
})
const notes = useNotesStore()
const navigation = useNavigationStore()

if (props.item.kind === 'note') notes.ensure()

function openNote(id: string) {
  notes.selectedId = id
  navigation.go('notes')
}

const agentsStore = useAgentsStore()
const signedIn = computed(() => agentsStore.status[props.agent].account !== null)
// Connexion validée au clavier : son champ disparaît, le focus passe à Renvoyer au lieu de tomber sur la page.
const resendButton = useTemplateRef('resendButton')
watch(signedIn, async (now) => {
  if (!now || !props.latest || (document.activeElement && document.activeElement !== document.body)) return
  await nextTick()
  resendButton.value?.$el?.focus()
})
</script>

<template>
  <template v-if="item.kind === 'command'">
    <ChatCommandRow :item="item" :running="running" />
    <ChatSkillForm :item="item" :agent-name="agents[agent].name" />
  </template>
  <ChatSessionMessage v-else-if="item.kind === 'user' && item.from" :from="item.from" :text="item.text" :agent="agent" :at="item.at" :chat-title="chatTitle" />
  <ChatTaskCard
    v-else-if="item.kind === 'tool' && item.name === START_SESSION"
    :title="item.detail?.description ?? null"
    :text="item.detail?.text ?? ''"
    :session-id="launched(item.output)"
    folded
  />
  <template v-else-if="item.kind === 'user'">
    <ul v-if="item.attachments?.length" class="flex max-w-[85%] flex-wrap justify-end gap-2" :aria-label="t('composer.attachments')">
      <li v-for="attachment in item.attachments" :key="attachment.preview ?? attachment.path" :title="attachment.path">
        <UiImagePreview v-if="attachment.preview" :src="previewSrc(attachment.preview)" :alt="attachment.name">
          <img :src="previewSrc(attachment.preview)" :alt="attachment.name" class="max-h-40 max-w-60 rounded-lg border border-stroke object-contain" />
        </UiImagePreview>
        <span v-else class="flex max-w-60 items-center gap-2 rounded-lg bg-content/6 px-2 py-1.5 text-xs">
          <component :is="attachment.kind === 'folder' ? Folder : File" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ attachment.name }}</span>
        </span>
      </li>
    </ul>
    <p
      v-if="item.text"
      class="max-w-[85%] rounded-xl bg-selection px-3 py-2 text-sm whitespace-pre-wrap break-words select-text"
    ><ChatPromptText :text="item.text" /></p>
    <p v-if="item.orchestra" class="flex items-center gap-1 text-[11px] text-violet" :title="t('composer.orchestra.sent')">
      <Orchestra class="size-3" aria-hidden="true" />{{ t('composer.orchestra.label') }}
    </p>
    <p v-if="item.steered" class="flex items-center gap-1 text-[11px] text-muted">
      <CornerDownRight class="size-3" aria-hidden="true" />{{ t('chat.queue.steered') }}
    </p>
    <div
      v-if="item.text"
      class="mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-(--hover-duration) group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
    >
      <time v-if="item.at" :datetime="new Date(item.at).toISOString()" :title="formatClock(item.at, locale, true)" class="px-1 text-[11px] text-muted tabular-nums">
        {{ formatClock(item.at, locale) }}
      </time>
      <ChatCopyButton :text="() => item.kind === 'user' ? item.text : ''" :label="t('chat.copy.message')" />
      <UiIconButton v-if="rewindable" :label="t('chat.rewind.action')" @click="emit('rewind')">
        <Undo class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
  </template>
  <ChatMarkdown v-else-if="item.kind === 'text'" :text="item.text" :streaming="streaming" :runs="item.id" />
  <ChatQuestionRecord v-else-if="item.kind === 'tool' && item.answers" :answers="item.answers" />
  <ChatSubagent v-else-if="item.kind === 'tool' && item.tool === 'agent'" class="-mx-2 text-sm" :item="item" :agent="agent" />
  <ChatTool v-else-if="item.kind === 'tool'" class="-mx-2 text-sm" :item="item" />
  <ChatCompact v-else-if="item.kind === 'compact'" :item="item" :agent="agent" />
  <!-- Séparateur entre deux tours : celui-ci, l'agent l'a ouvert seul quand sa tâche de fond a fini. -->
  <p v-else-if="item.kind === 'resume'" class="my-1 flex items-center gap-3 text-xs text-muted">
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
    <span class="max-w-[70%] truncate">{{ item.task ? t('chat.resumed.task', { task: item.task }) : t('chat.resumed.any') }}</span>
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
  </p>
  <p v-else-if="item.kind === 'git'" class="my-1 flex items-center gap-3 text-xs text-muted">
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
    <span class="flex max-w-[85%] min-w-0 gap-1.5" :title="[gitDetail, formatClock(item.at, locale, true)].filter(Boolean).join(' · ')">
      <span class="shrink-0">{{ t(`chat.git.${item.action}`) }}</span>
      <span v-if="gitDetail" class="min-w-0 truncate">{{ gitDetail }}</span>
    </span>
    <span class="h-px flex-1 bg-stroke" aria-hidden="true" />
  </p>
  <template v-else-if="item.kind === 'end'">
    <!-- Au survol seulement : copier, puis la durée du tour sous la dernière réponse, l'heure sous les précédentes. -->
    <div v-if="item.status === 'completed'" class="-ms-1 -mt-1.5 flex items-center gap-0.5 text-xs text-muted" :class="onHover">
      <ChatCopyButton v-if="answer && afterText" :text="answer" :label="t('chat.copy.answer')" />
      <ChatSaveNote v-if="answer && afterText" :text="answer" />
      <span v-if="latest && item.durationMs !== null" class="px-1 text-[11px] tabular-nums">
        {{ t('chat.end.completed', { duration: formatDuration(item.durationMs, locale, true) }) }}
      </span>
      <span v-else-if="!latest && item.at" class="px-1 text-[11px] tabular-nums">{{ formatClock(item.at, locale) }}</span>
      <p v-else-if="!afterText && !item.at" class="px-1">{{ t('chat.end.done') }}</p>
    </div>
    <p v-else-if="item.status === 'stopped'" class="text-xs text-muted">
      {{ afterText ? t('chat.end.stoppedKept', agentParams) : t('chat.end.stopped') }}
    </p>
    <!-- Connexion manquante sur le dernier message : une action à faire, pas une erreur. -->
    <div
      v-else-if="item.status === 'unauthenticated' && latest"
      class="rounded-xl border px-4 py-3"
      :class="signedIn ? 'border-stroke bg-content/3' : 'border-warning/40 bg-warning/10'"
    >
      <div v-if="signedIn" class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p class="min-w-40 flex-1 text-sm">{{ t('agentLogin.ready', agentParams) }}</p>
        <UiButton ref="resendButton" size="sm" variant="primary" @click="emit('resend')">{{ t('agentLogin.resend') }}</UiButton>
      </div>
      <AgentLogin v-else :kind="agent" />
    </div>
    <div v-else-if="item.status === 'unauthenticated'" class="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <TriangleAlert class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p class="min-w-0">{{ t('chat.end.unauthenticated', agentParams) }}</p>
    </div>
    <div v-else class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
      <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div class="min-w-0">
        <p>{{ t('chat.end.failed', agentParams) }}</p>
        <pre v-if="item.error" class="mt-1 font-mono text-xs whitespace-pre-wrap break-words text-muted select-text">{{ item.error }}</pre>
      </div>
    </div>
  </template>
  <!-- Résumé de la session enregistré : la carte mène à la note, même supprimée depuis (elle ne s'ouvre plus). -->
  <div v-else-if="item.kind === 'note'" class="page-in flex items-center gap-3 rounded-xl border border-stroke bg-content/3 px-3 py-2.5">
    <NotebookPen class="size-4 shrink-0 text-note" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-[11px] text-muted">{{ t('notes.summary.created') }}</p>
      <p class="truncate text-sm font-medium">{{ item.title || t('notes.untitled') }}</p>
      <p v-if="item.focus" class="truncate text-xs text-muted" :title="item.focus">{{ item.focus }}</p>
    </div>
    <UiButton v-if="notes.byId(item.noteId) || !notes.loaded" size="xs" variant="secondary" @click="openNote(item.noteId)">{{ t('notes.open') }}</UiButton>
    <span v-else class="shrink-0 text-xs text-muted">{{ t('notes.summary.deleted') }}</span>
  </div>
  <div v-else-if="item.kind === 'error'" class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
    <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
    <p class="min-w-0 break-words select-text">
      {{ t(`chat.errors.${item.error.kind}`, { ...agentParams, detail: item.error.message }) }}
    </p>
  </div>
</template>
