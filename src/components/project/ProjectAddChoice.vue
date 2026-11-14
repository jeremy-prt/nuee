<script setup lang="ts">
import { DialogDescription, DialogTitle, ListboxContent, ListboxFilter, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxRoot } from 'reka-ui'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { paletteHead, paletteInput, paletteRow } from '@/components/project/palette'
import { Folder, GitBranch, Github, Search } from '@/components/ui/icons'
import { menuHint, menuLabel, menuTitle } from '@/components/ui/menuRow'
import { normalize } from '@/utils/search'

export type AddSource = 'local' | 'github' | 'url'

// Premier écran d'« Ajouter un projet » : d'où vient le projet. `setup` : GitHub CLI absent ou trop ancien.
defineProps<{ setup?: boolean }>()
const emit = defineEmits<{ pick: [source: AddSource] }>()
const { t } = useI18n()
const listbox = useTemplateRef('listbox')
const query = ref('')

const sources = computed(() => [
  { value: 'local' as const, icon: Folder, title: t('addProject.local'), hint: t('addProject.localHint') },
  { value: 'github' as const, icon: Github, title: t('addProject.github'), hint: t('addProject.githubHint') },
  { value: 'url' as const, icon: GitBranch, title: t('addProject.url'), hint: t('addProject.urlHint') },
])
const shown = computed(() => {
  const needle = normalize(query.value).trim()
  return needle ? sources.value.filter((source) => normalize(`${source.title} ${source.hint}`).includes(needle)) : sources.value
})

onMounted(() => listbox.value?.highlightFirstItem())
</script>

<template>
  <ListboxRoot ref="listbox" highlight-on-hover class="flex min-h-0 flex-col">
    <div :class="paletteHead">
      <Search class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <ListboxFilter
        v-model="query"
        auto-focus
        data-palette-input
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :aria-label="t('addProject.filter')"
        :placeholder="t('addProject.filter')"
        :class="paletteInput"
      />
    </div>
    <DialogTitle class="sr-only">{{ t('addProject.title') }}</DialogTitle>
    <DialogDescription class="sr-only">{{ t('addProject.hint') }}</DialogDescription>
    <ListboxContent class="flex flex-col p-1.5">
      <ListboxGroup class="flex flex-col gap-0.5">
        <ListboxGroupLabel :class="menuTitle">{{ t('addProject.sources') }}</ListboxGroupLabel>
        <ListboxItem v-for="source in shown" :key="source.value" :value="source.value" :class="[paletteRow, 'py-2']" @select="emit('pick', source.value)">
          <component :is="source.icon" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span :class="menuLabel">{{ source.title }}</span>
            <span :class="menuHint">{{ source.hint }}</span>
          </span>
          <span v-if="source.value === 'github' && setup" class="shrink-0 rounded-sm bg-warning/15 px-1.5 py-px text-[11px] text-warning">
            {{ t('addProject.setup') }}
          </span>
        </ListboxItem>
        <p v-if="!shown.length" class="px-2 py-1.5 text-xs text-muted">{{ t('addProject.noSource') }}</p>
      </ListboxGroup>
    </ListboxContent>
  </ListboxRoot>
</template>
