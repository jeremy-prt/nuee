<script setup lang="ts">
import { Bot, Check, ChevronRight, Layers, Square, SquareTerminal, X } from '@/components/ui/icons'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ChatTaskOutput from '@/components/chat/ChatTaskOutput.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { type TaskState, useConversationsStore } from '@/stores/conversations'
import { useWorkspaceStore } from '@/stores/workspace'
import { formatDuration } from '@/utils/duration'
import { tasksOf } from '@/utils/tasks'

// Vue « Tâches » du panneau : sous-agents et commandes en arrière-plan de la session affichée.
const { t, locale } = useI18n()
const workspace = useWorkspaceStore()
const conversations = useConversationsStore()

const tab = computed(() => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? null)
const tasks = computed(() => tasksOf(conversations.find(workspace.activeTabId ?? '')?.items ?? []))

// Une commande qui tourne montre sa sortie d'office, et la garde une fois finie ; un clic la replie ou la rouvre.
const opened = ref(new Set<string>())
const seen = new Set<string>()
watch(
  tasks,
  (list) => {
    const running = list.filter(({ task }) => task.kind === 'command' && task.status === 'running' && !seen.has(task.id))
    if (!running.length) return
    for (const { task } of running) seen.add(task.id)
    opened.value = new Set([...opened.value, ...running.map(({ task }) => task.id)])
  },
  { immediate: true },
)
function isOpen(task: TaskState) {
  return task.kind === 'command' && opened.value.has(task.id)
}
function toggle(task: TaskState) {
  const next = new Set(opened.value)
  if (!next.delete(task.id)) next.add(task.id)
  opened.value = next
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ul v-if="tab && tasks.length" class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      <li v-for="{ tool, task } in tasks" :key="task.id" class="rounded-lg px-2 py-1.5 text-xs">
        <div class="flex min-w-0 items-center gap-1">
          <component
            :is="task.kind === 'command' ? 'button' : 'div'"
            :type="task.kind === 'command' ? 'button' : undefined"
            class="-ms-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-start"
            :class="{ 'hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring': task.kind === 'command' }"
            :aria-expanded="task.kind === 'command' ? isOpen(task) : undefined"
            @click="task.kind === 'command' && toggle(task)"
          >
            <ChatSpinner v-if="task.status === 'running'" :agent="tab.agent" class="text-sm" />
            <component :is="task.kind === 'agent' ? Bot : task.kind === 'command' ? SquareTerminal : Layers" v-else class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-content" :title="task.description ?? tool.summary ?? ''">
              {{ task.description ?? tool.detail?.description ?? tool.summary ?? tool.name }}
            </span>
            <span v-if="task.durationMs && task.status !== 'running'" class="shrink-0 text-muted tabular-nums">
              {{ formatDuration(task.durationMs, locale) }}
            </span>
            <Check v-if="task.status === 'completed'" class="size-3.5 shrink-0 text-success" aria-hidden="true" />
            <X v-else-if="task.status === 'failed'" class="size-3.5 shrink-0 text-danger" aria-hidden="true" />
            <span class="sr-only">{{ t(`dock.tasks.status.${task.status}`) }}</span>
            <ChevronRight
              v-if="task.kind === 'command'"
              class="size-3.5 shrink-0 text-muted transition-transform motion-reduce:transition-none"
              :class="{ 'rotate-90': isOpen(task) }"
              aria-hidden="true"
            />
          </component>
          <UiIconButton
            v-if="task.status === 'running'"
            :label="t('dock.tasks.stop')"
            class="size-6!"
            @click="conversations.stopTask(tab.id, task.id)"
          >
            <Square class="size-3" aria-hidden="true" />
          </UiIconButton>
        </div>
        <p class="ms-5.5 mt-0.5 flex gap-1.5 text-muted">
          <span>{{ t(task.background ? 'dock.tasks.background' : `dock.tasks.kind.${task.kind}`) }}</span>
          <span v-if="task.status === 'stopped'">· {{ t('dock.tasks.status.stopped') }}</span>
        </p>
        <p v-if="task.kind !== 'command' && task.progress && task.progress !== task.description" class="ms-5.5 mt-0.5 line-clamp-3 text-muted select-text" :title="task.progress">{{ task.progress }}</p>
        <ChatTaskOutput v-if="isOpen(task)" class="ms-5.5 mt-1.5" :chat-id="tab.id" :task-id="task.id" :running="task.status === 'running'" />
      </li>
    </ul>
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Layers class="size-6 text-muted" aria-hidden="true" />
      <p class="text-sm text-muted">{{ t('dock.tasks.empty') }}</p>
    </div>
  </div>
</template>
