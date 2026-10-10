<script setup lang="ts">
import { Bot, Check, ChevronRight, FilePen, FileText, Globe, LoaderCircle, Search, SquareTerminal, Wrench, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolKind } from '@/ipc/bindings/ToolKind'
import type { ChatItem } from '@/stores/conversations'

const props = defineProps<{ item: Extract<ChatItem, { kind: 'tool' }> }>()

const { t } = useI18n()

const ICONS: Record<ToolKind, typeof Wrench> = {
  read: FileText,
  edit: FilePen,
  command: SquareTerminal,
  search: Search,
  web: Globe,
  agent: Bot,
  other: Wrench,
}

const icon = computed(() => ICONS[props.item.tool])
</script>

<template>
  <component
    :is="item.output ? 'details' : 'div'"
    class="group text-xs"
    :class="item.output ? undefined : 'px-2 py-1'"
  >
    <component
      :is="item.output ? 'summary' : 'div'"
      class="flex min-w-0 items-center gap-2 rounded-md text-muted [&::-webkit-details-marker]:hidden"
      :class="item.output ? 'cursor-default list-none px-2 py-1 hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring' : undefined"
    >
      <component :is="icon" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="shrink-0 font-medium text-content">{{ item.name }}</span>
      <span v-if="item.summary" class="min-w-0 truncate font-mono" :title="item.summary">{{ item.summary }}</span>
      <span class="ms-auto flex shrink-0 items-center gap-1">
        <LoaderCircle v-if="item.status === 'running'" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Check v-else-if="item.status === 'done'" class="size-3.5" aria-hidden="true" />
        <X v-else class="size-3.5 text-danger" aria-hidden="true" />
        <span class="sr-only">{{ t(`chat.tool.${item.status}`) }}</span>
        <ChevronRight v-if="item.output" class="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </span>
    </component>
    <pre
      v-if="item.output"
      class="mt-1 max-h-64 overflow-auto rounded-md bg-selection/50 p-2 font-mono whitespace-pre-wrap text-muted select-text"
    >{{ item.output }}</pre>
  </component>
</template>
