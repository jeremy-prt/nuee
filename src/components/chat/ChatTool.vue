<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiff from '@/components/chat/ChatDiff.vue'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatThumb from '@/components/chat/ChatThumb.vue'
import type { ToolItem } from '@/stores/conversations'
import { useLayoutStore } from '@/stores/layout'
import { capitalize, fileName, fileVerb, toolName } from '@/utils/activity'
import { formatDuration } from '@/utils/duration'

// Une étape d'une suite d'outils, comme dans l'app Claude : sans icône, le verbe puis le fichier en clair, ou la
// phrase que l'agent donne à sa commande.
const props = defineProps<{ item: ToolItem }>()

const { t, locale } = useI18n()
const layout = useLayoutStore()

const task = computed(() => props.item.task ?? null)
const running = computed(() => props.item.status === 'running' || task.value?.status === 'running')
const background = computed(() => !!(props.item.detail?.background || task.value?.background))
const verb = computed(() => (props.item.summary ? fileVerb(props.item) : null))
// Titre d'une étape qui ne touche pas un fichier : ce que l'agent dit faire, sinon son paramètre (en chasse fixe).
const title = computed(() => {
  const { detail, summary, name } = props.item
  if (detail?.description && props.item.tool !== 'search') return { text: detail.description, mono: false }
  return summary ? { text: summary, mono: true } : { text: toolName(name), mono: false }
})
// Une sortie de modification (« fichier mis à jour ») n'apprend rien quand le diff est là ; celle d'un sous-agent
// est son rapport, déjà dans le bilan de sa tâche.
const output = computed(() => {
  const { change, status, output } = props.item
  if (status === 'failed') return output
  return change || (props.item.tool === 'agent' && task.value?.progress) ? null : output
})
const full = computed(() => {
  const text = props.item.detail?.text
  return text && (text !== props.item.summary || props.item.tool === 'command') ? text : null
})
const expandable = computed(() => !!(output.value || props.item.change || full.value || (task.value?.progress && !running.value)))
// Le détail (sortie, diff) n'entre dans la page qu'une fois la ligne dépliée.
const open = ref(false)
</script>

<template>
  <div>
    <!-- La vignette reste hors du bouton (un bouton n'en contient pas un autre), le survol couvre les deux. -->
    <div class="flex items-center gap-1 rounded-md" :class="{ 'hover:bg-selection-hover': expandable }">
      <component
        :is="expandable ? 'button' : 'div'"
        :type="expandable ? 'button' : undefined"
        class="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-start text-muted"
        :class="{ 'focus-visible:outline-2 focus-visible:outline-ring': expandable }"
        :aria-expanded="expandable ? open : undefined"
        @click="expandable && (open = !open)"
      >
        <template v-if="verb && item.summary">
          <span class="shrink-0" :class="{ 'text-shimmer': running }">{{ capitalize(t(`chat.activity.verbs.${verb}`), locale) }}</span>
          <span class="min-w-0 truncate text-content" :title="item.summary">{{ fileName(item.summary) }}</span>
        </template>
        <span
          v-else
          class="min-w-0 truncate"
          :class="{ 'font-mono text-xs': title.mono, 'text-shimmer': running }"
          :title="title.text"
        >{{ title.text }}</span>
        <ChatDiffStat v-if="item.change" :added="item.change.added" :removed="item.change.removed" />
        <span v-if="item.status === 'failed'" class="shrink-0 text-danger">{{ t('chat.tool.failed') }}</span>
        <span v-if="task && running && task.progress" class="max-w-56 truncate" :title="task.progress">{{ task.progress }}</span>
        <span v-if="task?.durationMs && !running" class="shrink-0 tabular-nums">{{ formatDuration(task.durationMs, locale) }}</span>
        <span class="sr-only">{{ t(`chat.tool.${running ? 'running' : item.status}`) }}</span>
        <ChevronRight
          v-if="expandable"
          class="size-3.5 shrink-0 transition-transform motion-reduce:transition-none"
          :class="{ 'rotate-90': open }"
          aria-hidden="true"
        />
      </component>
      <button
        v-if="background && running"
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring"
        @click="layout.showView('tasks')"
      >
        {{ t('chat.tool.live') }}
      </button>
      <ChatThumb v-if="item.image" :path="item.image" :alt="item.summary ?? item.name" :caption="item.name" class="ms-auto me-1" />
    </div>
    <div v-if="open" class="mx-2 mt-1 mb-2 flex flex-col gap-2 text-xs">
      <pre
        v-if="full"
        class="max-h-48 overflow-auto rounded-md bg-selection/50 p-2 font-mono whitespace-pre-wrap break-all text-content select-text"
      >{{ item.tool === 'command' ? `$ ${full}` : full }}</pre>
      <ChatDiff v-if="item.change" :patch="item.change.patch" />
      <ChatMarkdown v-if="task?.progress && !running" class="text-xs! text-muted" :text="task.progress" />
      <pre
        v-if="output"
        class="max-h-64 overflow-auto rounded-md bg-selection/30 p-2 font-mono whitespace-pre-wrap break-words select-text"
        :class="item.status === 'failed' ? 'text-danger' : 'text-muted'"
      >{{ output }}</pre>
    </div>
  </div>
</template>
