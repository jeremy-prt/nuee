<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import { useConversationsStore } from '@/stores/conversations'
import { useProjectsStore } from '@/stores/projects'
import type { Tab } from '@/stores/workspace'
import { agents } from '@/utils/agents'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const projects = useProjectsStore()
const conversations = useConversationsStore()

const project = computed(() => projects.byId(props.tab.projectId))
const conversation = computed(() => conversations.find(props.tab.id))
const items = computed(() => conversation.value?.items ?? [])
const running = computed(() => conversation.value?.running ?? false)
const agent = computed(() => conversation.value?.agent ?? 'claude')

function send(prompt: string) {
  if (project.value) conversations.send(props.tab.id, project.value.path, prompt)
}
</script>

<template>
  <!-- Le champ reste le même élément quand la conversation démarre : il garde le focus. -->
  <div class="flex flex-col">
    <ChatTranscript v-if="items.length" :items="items" :running="running" :agent="agent" class="min-h-0 flex-1" />
    <div v-else class="flex flex-1 flex-col items-center justify-end px-6 pb-8 text-center">
      <p class="text-3xl font-semibold tracking-tight">Nuée</p>
      <p class="mt-2 text-sm text-muted">
        {{ project ? t('chat.ready', { agent: agents[agent].name, project: project.name }) : t('chat.subtitle') }}
      </p>
    </div>
    <div class="flex justify-center px-6" :class="items.length ? 'pb-4' : 'flex-1 items-start pb-16'">
      <ChatComposer
        class="w-full max-w-3xl"
        :agent-name="agents[agent].name"
        :disabled="!project"
        :running="running"
        @send="send"
        @stop="conversations.stop(tab.id)"
      />
    </div>
  </div>
</template>
