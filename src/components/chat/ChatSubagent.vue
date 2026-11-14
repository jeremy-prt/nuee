<script setup lang="ts">
import { ChevronRight, Robot } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import ChatTool from '@/components/chat/ChatTool.vue'
import type { TaskStep, ToolItem } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import { modelName, toolName } from '@/utils/activity'
import { formatDuration } from '@/utils/duration'
import UiCollapse from '@/components/ui/UiCollapse.vue'

// Sous-agent lancé par l'agent, d'après monocode : sa mission, son modèle, ses étapes ; déplié, chaque outil qu'il
// appelle, reliés par un trait, puis son rapport. Durée comme T3 Code.
const props = defineProps<{ item: ToolItem; agent: AgentKind }>()

const { t, locale } = useI18n()
const layout = useLayoutStore()

const task = computed(() => props.item.task ?? null)
const running = computed(() => props.item.status === 'running' || task.value?.status === 'running')
const failed = computed(() => props.item.status === 'failed' || task.value?.status === 'failed')
const title = computed(() => task.value?.description ?? props.item.detail?.description ?? props.item.summary ?? toolName(props.item.name))
const steps = computed(() => task.value?.steps ?? [])
const count = computed(() => steps.value.length || task.value?.toolUses || 0)
// Comme une ligne d'activité de l'app Claude : le titre et la durée, le détail (modèle, étapes) en dépliant.
const facts = computed(() => (task.value?.durationMs && !running.value ? formatDuration(task.value.durationMs, locale.value) : null))
const details = computed(() => {
  const model = task.value?.model ? modelName(task.value.model) : null
  return [model, count.value ? t('chat.subagent.steps', { n: count.value }, count.value) : null].filter(Boolean).join(' · ')
})
// Pendant qu'il tourne, ce qu'il fait ; fini, son rapport (repris de la tâche, sinon de la sortie de l'outil).
const progress = computed(() => (running.value ? task.value?.progress : null) ?? null)
const report = computed(() => (running.value ? null : (task.value?.progress ?? props.item.output)))
const open = ref(false)
const expandable = computed(() => steps.value.length > 0 || !!report.value)

const stepItem = (step: TaskStep): ToolItem => ({ kind: 'tool', output: null, ...step })
// Trait de rattachement de monocode : un tronc, puis un quart de cercle vers chaque étape.
const rail =
  'relative ps-3.5 before:absolute before:start-0 before:top-0 before:h-full before:w-px before:bg-stroke-focus last:before:h-3.5 after:absolute after:start-0 after:top-1.5 after:size-2 after:rounded-es-lg after:border-s after:border-b after:border-stroke-focus'
</script>

<template>
  <div>
    <div class="flex items-center gap-1">
      <component
        :is="expandable ? 'button' : 'div'"
        :type="expandable ? 'button' : undefined"
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-start text-muted"
        :class="{ 'hover:text-content focus-visible:outline-2 focus-visible:outline-ring': expandable }"
        :aria-expanded="expandable ? open : undefined"
        @click="expandable && (open = !open)"
      >
        <!-- Robot à lui, comme la mascotte de monocode, en bleu ciel (le violet est celui d'Orchestre) : il sautille tant qu'il travaille. -->
        <Robot class="size-4 shrink-0" :class="failed ? 'text-danger' : ['text-mention', { 'subagent-live': running }]" aria-hidden="true" />
        <span class="min-w-0 truncate" :class="{ 'text-shimmer': running, 'text-danger': failed }" :title="title">{{ title }}</span>
        <span v-if="progress" class="min-w-0 truncate text-xs" :title="progress">{{ progress }}</span>
        <span v-if="facts" class="shrink-0 text-xs tabular-nums">{{ facts }}</span>
        <span class="sr-only">{{ t(`chat.tool.${running ? 'running' : failed ? 'failed' : 'done'}`) }}</span>
        <ChevronRight
          v-if="expandable"
          class="size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
          :class="{ 'rotate-90': open }"
          aria-hidden="true"
        />
      </component>
      <button
        v-if="task?.background && running"
        type="button"
        class="shrink-0 rounded-md px-1.5 py-0.5 text-content hover:bg-selection-inner focus-visible:outline-2 focus-visible:outline-ring"
        @click="layout.showView('tasks')"
      >
        {{ t('chat.tool.live') }}
      </button>
    </div>
    <UiCollapse>
      <ol v-if="open" class="ms-3 mt-0.5 mb-2 text-xs">
        <li v-if="details" :class="[rail, 'px-2 py-1 text-muted']">{{ details }}</li>
        <li v-for="step in steps" :key="step.id" :class="rail">
          <ChatTool :item="stepItem(step)" />
        </li>
        <li v-if="report" :class="[rail, 'py-1']">
          <ChatMarkdown class="px-2 text-xs!" :class="failed ? 'text-danger' : 'text-muted'" :text="report" />
        </li>
      </ol>
    </UiCollapse>
  </div>
</template>

<style scoped>
.subagent-live {
  animation: subagent-hop 920ms steps(1, end) infinite;
}

/* 4e tracé de RoboticIcon : la boule de l'antenne. */
.subagent-live :deep(path:nth-child(4)) {
  animation: subagent-antenna 920ms steps(1, end) infinite;
}

@keyframes subagent-hop {
  50% {
    transform: translateY(-1px);
  }
}

@keyframes subagent-antenna {
  50% {
    fill: currentColor;
  }
}

@media (prefers-reduced-motion: reduce) {
  .subagent-live,
  .subagent-live :deep(path:nth-child(4)) {
    animation: none;
  }
}
</style>
