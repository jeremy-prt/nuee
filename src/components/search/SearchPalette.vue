<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  ListboxContent,
  ListboxFilter,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxRoot,
} from 'reka-ui'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import { Search, Settings } from '@/components/ui/icons'
import { menuHint, menuLabel, menuTitle } from '@/components/ui/menuRow'
import { paletteHead, paletteInput, paletteRow } from '@/components/ui/palette'
import UiPaletteKeys from '@/components/ui/UiPaletteKeys.vue'
import { type PaletteRow, usePaletteSearch } from '@/composables/usePaletteSearch'
import { useClockStore } from '@/stores/clock'
import { useSearchStore } from '@/stores/search'
import { formatSince } from '@/utils/duration'
import { shortcutLabel } from '@/utils/shortcuts'

const { t, locale } = useI18n()
const store = useSearchStore()
const clock = useClockStore()
const listbox = useTemplateRef('listbox')
const query = ref('')
const { groups, choose, pending } = usePaletteSearch(query)
// Une ligne choisie décide elle-même où va le focus (champ d'une session, réglage révélé…).
let chosen = false

const rows = computed(() => groups.value.flatMap((group) => group.rows))

const key = (name: string) => shortcutLabel({ key: name, mod: false })
const keys = computed(() => [
  { id: 'navigate', keys: [key('ArrowUp'), key('ArrowDown')], label: t('search.navigate') },
  { id: 'open', keys: [key('Enter')], label: t('search.open') },
  { id: 'commands', keys: ['>'], label: t('search.commandsOnly') },
  { id: 'close', keys: [key('Escape')], label: t('search.close') },
])

watch(
  () => store.open,
  (open) => {
    if (!open) return
    query.value = ''
    chosen = false
    void store.refresh()
  },
)

// Les résultats changent à chaque frappe : la première ligne reste celle que ↵ ouvre.
watch(
  () => rows.value.map((row) => row.key).join('\n'),
  () => void nextTick(() => listbox.value?.highlightFirstItem()),
)

function select(row: PaletteRow) {
  chosen = true
  store.open = false
  void nextTick(() => choose(row))
}

function onCloseAutoFocus(event: Event) {
  if (chosen) event.preventDefault()
}

const since = (at: number) => formatSince(at, clock.now, locale.value, true)
</script>

<template>
  <DialogRoot v-model:open="store.open">
    <DialogPortal>
      <DialogOverlay class="ui-overlay fixed inset-0 z-50 bg-black/40" />
      <DialogContent
        class="ui-glass ui-glass-raised fixed inset-0 z-50 m-auto flex h-[min(30rem,76vh)] w-[min(38rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl text-content outline-none select-none"
        @open-auto-focus.prevent
        @close-auto-focus="onCloseAutoFocus"
      >
        <DialogTitle class="sr-only">{{ t('rail.search') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ t('search.hint') }}</DialogDescription>
        <ListboxRoot ref="listbox" highlight-on-hover class="flex min-h-0 flex-1 flex-col">
          <div :class="paletteHead">
            <Search class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <ListboxFilter
              v-model="query"
              auto-focus
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              writingsuggestions="false"
              :aria-label="t('rail.search')"
              :placeholder="t('search.placeholder')"
              :class="paletteInput"
            />
          </div>
          <ListboxContent class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1.5">
            <ListboxGroup v-for="group in groups" :key="group.id" class="flex flex-col gap-0.5">
              <ListboxGroupLabel :class="menuTitle">
                {{ t(`search.${group.id}`) }}
              </ListboxGroupLabel>
              <ListboxItem v-for="row in group.rows" :key="row.key" :value="row.key" :class="[paletteRow, 'min-h-9 py-1.5']" @select="select(row)">
                <template v-if="row.kind === 'session'">
                  <SettingsAgentLogo :id="row.tab.agent" tiny class="mt-0.5 shrink-0 self-start" />
                  <span class="min-w-0 flex-1">
                    <span class="flex min-w-0 items-baseline gap-1.5">
                      <span :class="[menuLabel, { 'text-content/65': row.tab.archived }]">{{ row.title }}</span>
                      <span v-if="row.tab.archived" class="shrink-0 text-[11px] text-muted">{{ t('search.archived') }}</span>
                    </span>
                    <span v-if="row.snippet" :class="menuHint">
                      {{ row.snippet.before }}<mark class="rounded-sm bg-signal/20 text-content">{{ row.snippet.match }}</mark>{{ row.snippet.after }}
                    </span>
                  </span>
                  <span class="w-32 shrink-0 self-start truncate text-[11px] leading-5 text-muted">{{ row.project }}</span>
                  <span class="w-12 shrink-0 self-start text-end text-[11px] leading-5 text-muted tabular-nums">{{ since(row.tab.updatedAt) }}</span>
                </template>
                <template v-else-if="row.kind === 'project'">
                  <ProjectIcon :project="row.project" class="size-4 shrink-0 rounded-sm" />
                  <span :class="[menuLabel, 'min-w-0 flex-1']">{{ row.project.name }}</span>
                  <span class="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-muted" dir="rtl">{{ row.project.path }}</span>
                </template>
                <template v-else-if="row.kind === 'command'">
                  <span :class="[menuLabel, 'min-w-0 flex-1']">{{ row.title }}</span>
                  <kbd v-if="row.shortcut" class="shrink-0 font-sans text-[11px] text-muted">{{ row.shortcut }}</kbd>
                </template>
                <template v-else>
                  <Settings class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span :class="[menuLabel, 'min-w-0 flex-1']">{{ row.title }}</span>
                  <span class="max-w-[45%] shrink-0 truncate text-[11px] text-muted">{{ row.path }}</span>
                </template>
              </ListboxItem>
            </ListboxGroup>
            <p v-if="!groups.length && !pending" class="px-2 py-1.5 text-xs text-muted" role="status">{{ t('search.noResults') }}</p>
          </ListboxContent>
          <div class="flex h-11 shrink-0 items-center border-t border-stroke px-3.5">
            <UiPaletteKeys :items="keys" />
          </div>
        </ListboxRoot>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
