<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import { useCatalogStore } from '@/stores/catalog'
import { DEFAULT_OPTIONS, useConversationsStore } from '@/stores/conversations'
import { useProjectsStore } from '@/stores/projects'
import type { Tab } from '@/stores/workspace'
import { agents } from '@/utils/agents'

const props = defineProps<{ tab: Tab }>()

const { t } = useI18n()
const projects = useProjectsStore()
const conversations = useConversationsStore()
const catalog = useCatalogStore()

// Le pane est recréé à chaque changement d'onglet (:key), l'historique se charge donc ici.
conversations.open(props.tab.id, props.tab.agent)
catalog.load(props.tab.agent)

const project = computed(() => projects.byId(props.tab.projectId))
const conversation = computed(() => conversations.find(props.tab.id))
const items = computed(() => conversation.value?.items ?? [])
const running = computed(() => conversation.value?.running ?? false)
const loaded = computed(() => conversation.value?.loaded ?? false)
const agent = computed(() => props.tab.agent)
const options = computed({
  get: () => catalog.resolve(agent.value, conversation.value?.options ?? DEFAULT_OPTIONS),
  set: (value) => conversations.setOptions(props.tab.id, value),
})

function send(prompt: string) {
  conversations.send(props.tab.id, project.value?.path ?? null, prompt)
}
</script>

<template>
  <!-- Le champ reste le même élément quand la conversation démarre : il garde le focus. -->
  <div class="flex flex-col">
    <ChatTranscript v-if="items.length" :items="items" :running="running" :agent="agent" class="min-h-0 flex-1" />
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
    <div class="flex justify-center px-6" :class="items.length ? 'pb-4' : 'flex-1 items-start pb-16'">
      <ChatComposer
        class="w-full max-w-3xl"
        v-model:options="options"
        :agent-name="agents[agent].name"
        :catalog="catalog.get(agent)"
        :disabled="!loaded"
        :running="running"
        @send="send"
        @stop="conversations.stop(tab.id)"
      />
    </div>
  </div>
</template>
