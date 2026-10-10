<script setup lang="ts">
import { Search } from '@lucide/vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type SettingResult, useSettingsSearch } from '@/composables/useSettingsSearch'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'

const { t } = useI18n()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const query = ref('')
const open = ref(false)
const { results } = useSettingsSearch(query)

watch(query, (value) => (open.value = !!value.trim()))

// Choisi au clavier, le focus suit jusqu'au réglage ; à la souris, il quitte simplement le champ.
// Entrée passe par un clic simulé sur le résultat : `detail` vaut alors 0.
function choose(result: SettingResult, event: CustomEvent<{ originalEvent: Event }>) {
  const original = event.detail.originalEvent
  const byKeyboard = original instanceof KeyboardEvent || (original instanceof MouseEvent && original.detail === 0)
  navigation.revealSetting(result.entry.section, result.entry.detail ?? null, result.entry.id, byKeyboard)
  query.value = ''
  if (!byKeyboard) (document.activeElement as HTMLElement | null)?.blur()
}

// Échap vide le champ, puis le quitte : il ne doit pas fermer les réglages comme ailleurs dans la page.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  if (query.value) query.value = ''
  else (event.target as HTMLElement).blur()
}
</script>

<template>
  <ComboboxRoot v-model:open="open" ignore-filter :reset-search-term-on-blur="false" class="w-56 shrink-0">
    <ComboboxAnchor
      class="flex h-7 items-center gap-1.5 rounded-md border border-stroke bg-selection/50 px-2 focus-within:border-stroke-focus"
    >
      <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <ComboboxInput
        id="settings-search"
        v-model="query"
        :display-value="() => ''"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :aria-label="t('settings.search.label')"
        :placeholder="t('settings.search.placeholder')"
        class="min-w-0 flex-1 bg-transparent text-xs outline-none select-text placeholder:text-muted"
        @keydown="onKeydown"
      />
      <kbd v-if="!query && shortcuts.label('searchSettings')" class="font-sans text-xs text-muted" aria-hidden="true">
        {{ shortcuts.label('searchSettings') }}
      </kbd>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        side="bottom"
        align="end"
        :side-offset="6"
        class="ui-pop z-50 max-h-80 w-80 origin-(--reka-combobox-content-transform-origin) overflow-y-auto p-1 text-xs text-content select-none"
      >
        <ComboboxViewport>
          <p v-if="!results.length" class="px-2 py-1.5 text-muted">{{ t('settings.search.empty') }}</p>
          <ComboboxItem
            v-for="result in results"
            :key="result.key"
            :value="result.key"
            class="flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-1.5 text-content/75 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content"
            @select="choose(result, $event)"
          >
            <span class="min-w-0 flex-1 truncate">{{ result.label }}</span>
            <span class="max-w-36 shrink-0 truncate text-muted">{{ result.path }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
