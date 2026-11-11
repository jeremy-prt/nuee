<script setup lang="ts">
import { Bot, ChevronRight, Layers, Square, SquareTerminal, X } from '@/components/ui/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import ChatTaskOutput from '@/components/chat/ChatTaskOutput.vue'
import ShellDockToolbar from '@/components/shell/ShellDockToolbar.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
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
  return opened.value.has(task.id)
}
function toggle(task: TaskState) {
  const next = new Set(opened.value)
  if (!next.delete(task.id)) next.add(task.id)
  opened.value = next
}

// Comme l'onglet Tâches de Claude Code : en cours d'abord, puis les terminées, repliables.
const running = computed(() => tasks.value.filter(({ task }) => task.status === 'running'))
const done = computed(() => tasks.value.filter(({ task }) => task.status !== 'running'))
const doneOpen = ref(true)

// Durée qui défile pour les tâches en cours ; l'horloge ne tourne que s'il y en a une.
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

function duration(task: TaskState) {
  if (task.status === 'running') return task.startedAt ? formatDuration(now.value - task.startedAt, locale.value) : null
  return task.durationMs ? formatDuration(task.durationMs, locale.value) : null
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ShellDockToolbar :label="t('dock.tasks.title')">
      <h2 class="flex min-w-0 items-center gap-1.5 ps-1 text-xs font-medium">
        <span class="truncate">{{ t('dock.tasks.title') }}</span>
        <span v-if="tab && tasks.length" class="font-normal text-muted tabular-nums">{{ tasks.length }}</span>
      </h2>
    </ShellDockToolbar>
    <div v-if="tab && tasks.length" class="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
      <template v-for="group in [{ id: 'running', items: running }, { id: 'done', items: done }]" :key="group.id">
        <section v-if="group.items.length" class="mb-2">
          <h3>
            <button
              type="button"
              class="flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-start font-medium text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
              :aria-expanded="group.id === 'running' || doneOpen"
              :disabled="group.id === 'running'"
              @click="doneOpen = !doneOpen"
            >
              <ChevronRight
                v-if="group.id === 'done'"
                class="size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
                :class="{ 'rotate-90': doneOpen }"
                aria-hidden="true"
              />
              {{ t(`dock.tasks.groups.${group.id}`) }}
              <span class="font-normal tabular-nums">{{ group.items.length }}</span>
            </button>
          </h3>
          <ul v-if="group.id === 'running' || doneOpen" class="flex flex-col gap-1.5">
            <li v-for="{ tool, task } in group.items" :key="task.id" class="rounded-lg bg-content/4">
              <div class="flex min-w-0 items-center gap-1 pe-1.5">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 ps-2.5 text-start focus-visible:outline-2 focus-visible:outline-ring"
                  :aria-expanded="isOpen(task)"
                  @click="toggle(task)"
                >
                  <ChevronRight class="size-3.5 shrink-0 text-muted transition-transform motion-reduce:transition-none" :class="{ 'rotate-90': isOpen(task) }" aria-hidden="true" />
                  <ChatSpinner v-if="task.status === 'running'" :agent="tab.agent" class="text-sm" />
                  <component :is="task.kind === 'agent' ? Bot : task.kind === 'command' ? SquareTerminal : Layers" v-else class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-content" :title="task.description ?? tool.summary ?? ''">
                    {{ task.description ?? tool.detail?.description ?? tool.summary ?? tool.name }}
                  </span>
                  <X v-if="task.status === 'failed'" class="size-3.5 shrink-0 text-danger" aria-hidden="true" />
                  <span v-if="duration(task)" class="shrink-0 text-muted tabular-nums">{{ duration(task) }}</span>
                  <span class="sr-only">{{ t(`dock.tasks.status.${task.status}`) }}</span>
                </button>
                <UiIconButton v-if="task.status === 'running'" :label="t('dock.tasks.stop')" class="size-6!" @click="conversations.stopTask(tab.id, task.id)">
                  <Square class="size-3" aria-hidden="true" />
                </UiIconButton>
              </div>
              <div v-if="isOpen(task)" class="flex flex-col gap-1 px-3 pb-2.5 ps-8">
                <p class="flex gap-1.5 text-muted">
                  <span>{{ t(task.background ? 'dock.tasks.background' : `dock.tasks.kind.${task.kind}`) }}</span>
                  <span v-if="task.status !== 'running'">· {{ t(`dock.tasks.status.${task.status}`) }}</span>
                </p>
                <p v-if="task.progress && task.progress !== task.description" class="line-clamp-4 text-muted select-text" :title="task.progress">{{ task.progress }}</p>
                <ChatTaskOutput v-if="task.kind === 'command'" class="mt-1" :chat-id="tab.id" :task-id="task.id" :running="task.status === 'running'" />
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <UiEmpty v-else :icon="Layers" :title="t('dock.tasks.emptyTitle')" :description="t('dock.tasks.empty')" />
  </div>
</template>
