<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@/components/ui/icons'
import { computed, ref, useId } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import ChatFoldText from '@/components/chat/ChatFoldText.vue'
import ChatTaskCard from '@/components/chat/ChatTaskCard.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useClockStore } from '@/stores/clock'
import type { MessageFrom } from '@/stores/conversations'
import { useWorkspaceStore } from '@/stores/workspace'
import { agents } from '@/utils/agents'
import { formatSince } from '@/utils/duration'

// Message venu d'une autre session, comme l'app Claude. Consigne de départ : « Démarrée par … depuis … » et la carte
// « Tâche ». Message ou fin de tour : une ligne « Message reçu de … », le texte atténué dessous. Le titre ouvre la
// session, la flèche replie ce qui suit.
const props = defineProps<{ from: MessageFrom; text: string; agent: AgentKind; at?: number; chatTitle?: string | null }>()

const { t, locale } = useI18n()
const clock = useClockStore()
const workspace = useWorkspaceStore()

const source = computed(() => workspace.tabs.find((tab) => tab.id === props.from.id && !tab.archived) ?? null)
const title = computed(() => source.value?.title ?? props.from.title ?? t('workspace.chatTitle'))
const agentName = computed(() => agents[source.value?.agent ?? props.agent].name)
const since = computed(() => (props.at ? formatSince(props.at, clock.now, locale.value) : null))
// Une fin de tour arrive repliée : l'orchestrateur en tire sa propre réponse juste dessous.
const open = ref(!props.from.report)
const bodyId = useId()
</script>

<template>
  <div class="text-sm">
    <div class="group/line flex min-w-0 items-center gap-1 text-muted">
      <Translation :keypath="from.task ? 'chat.fromSession.started' : 'chat.fromSession.message'" tag="p" class="min-w-0 truncate">
        <template #agent>{{ agentName }}</template>
        <template #title>
          <button
            v-if="source"
            type="button"
            class="rounded text-content underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            @click="workspace.openTab(from.id)"
          >{{ title }}</button>
          <span v-else class="text-content">{{ title }}</span>
        </template>
      </Translation>
      <span v-if="from.task && since" class="shrink-0">{{ since }}</span>
      <button
        type="button"
        class="grid size-5 shrink-0 place-items-center rounded group-hover/line:text-content focus-visible:outline-2 focus-visible:outline-ring"
        :aria-label="t(from.task ? 'chat.fromSession.showTask' : 'chat.fromSession.show')"
        :aria-expanded="open"
        :aria-controls="open ? bodyId : undefined"
        @click="open = !open"
      >
        <component :is="open ? ChevronDown : ChevronRight" class="size-3.5" aria-hidden="true" />
      </button>
    </div>
    <template v-if="open">
      <ChatTaskCard v-if="from.task" :id="bodyId" class="mt-2" :title="chatTitle ?? null" :text="text" />
      <ChatFoldText v-else :id="bodyId" class="mt-1 text-muted" :text="text" />
    </template>
  </div>
</template>
