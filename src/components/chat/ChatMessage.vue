<script setup lang="ts">
import { CircleAlert, CornerDownRight, File, Folder, Undo } from '@/components/ui/icons'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentLogin from '@/components/agent/AgentLogin.vue'
import ChatCommandRow from '@/components/chat/ChatCommandRow.vue'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatPromptText from '@/components/chat/ChatPromptText.vue'
import ChatSkillForm from '@/components/chat/ChatSkillForm.vue'
import ChatTool from '@/components/chat/ChatTool.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { previewSrc } from '@/ipc/attachment'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import type { ChatItem } from '@/stores/conversations'
import { agents } from '@/utils/agents'
import { formatDuration } from '@/utils/duration'

// Un élément de la conversation hors activité groupée. `streaming` : texte que l'agent écrit encore ;
// `afterText` : l'élément précédent est un texte de l'agent ; `answer` : réponse du tour, sur sa ligne de fin.
const props = defineProps<{
  item: ChatItem
  agent: AgentKind
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

const { t, locale } = useI18n()
const agentParams = computed(() => ({ agent: agents[props.agent].name, command: agents[props.agent].command }))
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
  <template v-else-if="item.kind === 'user'">
    <ul v-if="item.attachments?.length" class="flex max-w-[85%] flex-wrap justify-end gap-2" :aria-label="t('composer.attachments')">
      <li v-for="attachment in item.attachments" :key="attachment.preview ?? attachment.path" :title="attachment.path">
        <UiImagePreview v-if="attachment.preview" :src="previewSrc(attachment.preview)" :alt="attachment.name">
          <img :src="previewSrc(attachment.preview)" :alt="attachment.name" class="max-h-40 max-w-60 rounded-lg border border-stroke object-contain" />
        </UiImagePreview>
        <span v-else class="flex max-w-60 items-center gap-2 rounded-lg border border-stroke px-2 py-1.5 text-xs">
          <component :is="attachment.kind === 'folder' ? Folder : File" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ attachment.name }}</span>
        </span>
      </li>
    </ul>
    <p
      v-if="item.text"
      class="max-w-[85%] rounded-xl bg-selection px-3 py-2 text-sm whitespace-pre-wrap break-words select-text"
    ><ChatPromptText :text="item.text" /></p>
    <p v-if="item.steered" class="flex items-center gap-1 text-[11px] text-muted">
      <CornerDownRight class="size-3" aria-hidden="true" />{{ t('chat.queue.steered') }}
    </p>
    <div
      v-if="item.text"
      class="-mt-0.5 flex gap-0.5 opacity-0 transition-opacity duration-(--hover-duration) group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
    >
      <ChatCopyButton :text="() => item.kind === 'user' ? item.text : ''" :label="t('chat.copy.message')" />
      <UiIconButton v-if="rewindable" :label="t('chat.rewind.action')" @click="emit('rewind')">
        <Undo class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
  </template>
  <ChatMarkdown v-else-if="item.kind === 'text'" :text="item.text" :streaming="streaming" />
  <ChatTool v-else-if="item.kind === 'tool'" class="-mx-2 text-sm" :item="item" />
  <template v-else-if="item.kind === 'end'">
    <!-- Le bouton déborde à gauche : son icône s'aligne sur le texte de l'agent. -->
    <div v-if="item.status === 'completed'" class="flex items-center gap-1 text-xs text-muted">
      <ChatCopyButton v-if="answer && afterText" class="-my-1 -ms-1.5 size-6!" :text="answer" :label="t('chat.copy.answer')" />
      <p class="ms-auto">{{ item.durationMs === null ? t('chat.end.done') : t('chat.end.completed', { duration: formatDuration(item.durationMs, locale, true) }) }}</p>
    </div>
    <p v-else-if="item.status === 'stopped'" class="text-xs text-muted">
      {{ afterText ? t('chat.end.stoppedKept', agentParams) : t('chat.end.stopped') }}
    </p>
    <!-- Connexion manquante sur le dernier message : une action à faire, pas une erreur. -->
    <div v-else-if="item.status === 'unauthenticated' && latest" class="rounded-xl border border-stroke bg-content/3 px-4 py-3">
      <div v-if="signedIn" class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p class="min-w-40 flex-1 text-sm">{{ t('agentLogin.ready', agentParams) }}</p>
        <UiButton ref="resendButton" size="sm" variant="primary" @click="emit('resend')">{{ t('agentLogin.resend') }}</UiButton>
      </div>
      <AgentLogin v-else :kind="agent" />
    </div>
    <div v-else class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
      <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div class="min-w-0">
        <p v-if="item.status === 'unauthenticated'">{{ t('chat.end.unauthenticated', agentParams) }}</p>
        <template v-else>
          <p>{{ t('chat.end.failed', agentParams) }}</p>
          <pre v-if="item.error" class="mt-1 font-mono text-xs whitespace-pre-wrap break-words text-muted select-text">{{ item.error }}</pre>
        </template>
      </div>
    </div>
  </template>
  <div v-else-if="item.kind === 'error'" class="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
    <CircleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
    <p class="min-w-0 break-words select-text">
      {{ t(`chat.errors.${item.error.kind}`, { ...agentParams, detail: item.error.message }) }}
    </p>
  </div>
</template>
