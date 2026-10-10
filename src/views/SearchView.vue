<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellChatItem from '@/components/shell/ShellChatItem.vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

const query = ref('')
const input = ref<HTMLInputElement>()

const results = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return []
  return workspace.startedChats.filter((tab) => tabTitle(tab).toLowerCase().includes(needle))
})

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
      class="h-10 w-full rounded-lg border border-stroke bg-selection/50 px-3 text-sm select-text outline-none placeholder:text-muted focus:border-stroke-focus"
      :placeholder="t('search.placeholder')"
    />
    <ul v-if="results.length" class="mt-3 space-y-0.5">
      <li v-for="tab in results" :key="tab.id"><ShellChatItem :tab="tab" /></li>
    </ul>
    <p v-else class="mt-4 px-1 text-sm text-muted" aria-live="polite">
      {{ query.trim() ? t('search.noResults') : t('search.hint') }}
    </p>
  </div>
</template>
