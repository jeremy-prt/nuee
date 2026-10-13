<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import { useDebounced } from '@/composables/useDebounced'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useTabTitle } from '@/composables/useTabTitle'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

const query = ref('')
const input = ref<HTMLInputElement>()

const searched = useDebounced(query)
const results = computed(() => {
  const needle = searched.value.trim().toLowerCase()
  if (!needle) return []
  return workspace.startedChats.filter((tab) => tabTitle(tab).toLowerCase().includes(needle))
})

const { shown, more, limit, sentinel } = useProgressiveList(results, () => searched.value)

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-xl flex-col px-6 pt-16">
    <h2 class="sr-only">{{ t('rail.search') }}</h2>
    <label for="search-query" class="sr-only">{{ t('rail.search') }}</label>
    <input
      id="search-query"
      ref="input"
      v-model="query"
      type="search"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      writingsuggestions="false"
      data-control
      class="h-10 w-full rounded-lg border border-stroke bg-selection/50 px-3 text-sm select-text outline-none placeholder:text-muted focus:border-stroke-focus"
      :placeholder="t('search.placeholder')"
    />
    <div v-if="results.length" class="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
      <ul class="space-y-0.5">
        <li v-for="tab in shown" :key="tab.id"><ShellChatItem :tab="tab" /></li>
      </ul>
      <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
    </div>
    <p v-else class="mt-4 px-1 text-sm text-muted" aria-live="polite">
      {{ searched.trim() ? t('search.noResults') : t('search.hint') }}
    </p>
  </div>
</template>
