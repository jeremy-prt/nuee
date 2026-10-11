<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatApproval from '@/components/chat/ChatApproval.vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import { useFileDrop } from '@/composables/useFileDrop'
import { useCatalogStore } from '@/stores/catalog'
import { DEFAULT_OPTIONS, useConversationsStore } from '@/stores/conversations'
import type { Attachment } from '@/ipc/bindings/Attachment'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { agents } from '@/utils/agents'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const projects = useProjectsStore()
const conversations = useConversationsStore()
const catalog = useCatalogStore()
const workspace = useWorkspaceStore()

// Le pane est recréé à chaque changement d'onglet (:key), l'historique se charge donc ici.
conversations.open(props.tab.id, props.tab.agent)
catalog.load(props.tab.agent)

const project = computed(() => projects.byId(props.tab.projectId))
const conversation = computed(() => conversations.find(props.tab.id))
const items = computed(() => conversation.value?.items ?? [])
const answering = computed(() => conversation.value?.phase === 'answering')
// Une réponse est attendue : l'agent répond, ou un message attend la fin du tour précédent.
const waiting = computed(() => answering.value || !!conversation.value?.queued)
const loaded = computed(() => conversation.value?.loaded ?? false)
const agent = computed(() => props.tab.agent)
const options = computed({
  get: () => catalog.resolve(agent.value, conversation.value?.options ?? DEFAULT_OPTIONS),
  set: (value) => conversations.setOptions(props.tab.id, value),
})

const cwd = computed(() => project.value?.path ?? null)
const approval = computed(() => conversation.value?.approvals[0] ?? null)

function send(prompt: string, attachments: Attachment[]) {
  if (!items.value.some((item) => item.kind === 'user')) workspace.startChat(props.tab.id, prompt, attachments)
  conversations.send(props.tab.id, cwd.value, prompt, attachments)
}

const pane = useTemplateRef('pane')
const composer = useTemplateRef('composer')
const { over } = useFileDrop(pane, (paths) => {
  if (loaded.value) composer.value?.attach(paths)
})
</script>

<template>
  <!-- Le champ reste le même élément quand la conversation démarre : il garde le focus. -->
  <div ref="pane" class="relative flex flex-col">
    <ChatTranscript v-if="items.length" :items="items" :running="waiting" :agent="agent" class="min-h-0 flex-1" />
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
      <ChatComposer
        ref="composer"
        class="w-full max-w-(--chat-width)"
        :chat-id="tab.id"
        v-model:options="options"
        :agent-name="agents[agent].name"
        :catalog="catalog.get(agent)"
        :disabled="!loaded"
        :running="answering"
        @send="send"
        @warm="conversations.warm(tab.id, cwd)"
        @stop="conversations.stop(tab.id)"
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
