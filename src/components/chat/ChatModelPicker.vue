<script setup lang="ts">
import { Check, ChevronDown, Search, Star } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { ModelInfo } from '@/ipc/bindings/ModelInfo'
import { useCatalogStore } from '@/stores/catalog'
import { useShortcutsStore } from '@/stores/shortcuts'
import { agents } from '@/utils/agents'
import { matchScore, normalize, searchField } from '@/utils/search'

// Modèle de la session : recherche, favoris en tête (étoile de chaque ligne). `focusAfter` : le champ de saisie
// reprend le focus à la fermeture.
const props = defineProps<{ agent: AgentKind; catalog: Catalog | null; disabled: boolean; focusAfter?: () => void }>()
const model = defineModel<string | null>({ required: true })

const { t } = useI18n()
const store = useCatalogStore()
const shortcuts = useShortcutsStore()
const open = ref(false)
const query = ref('')

const agentName = computed(() => agents[props.agent].name)
const models = computed(() => props.catalog?.models ?? [])
const current = computed(() => models.value.find((item) => item.value === model.value) ?? null)

// Ligne surlignée (souris ou flèches) : le raccourci des favoris porte sur elle.
const highlighted = ref<string | null>(null)

watch(open, (value) => {
  if (value) return
  query.value = ''
  highlighted.value = null
})

function onKeydown(event: KeyboardEvent) {
  if (!highlighted.value || !shortcuts.matches(event, 'favoriteModel')) return
  event.preventDefault()
  store.toggleFavorite(props.agent, highlighted.value)
}

// Sans recherche : favoris puis les autres, dans l'ordre de l'agent. Avec : début du nom d'abord, puis tolérance.
const groups = computed(() => {
  const needle = normalize(query.value)
  if (needle) {
    const found = models.value.flatMap((item) => {
      if (normalize(item.label).startsWith(needle)) return [{ item, score: -1 }]
      const score = matchScore(needle, [searchField(item.label, 0), searchField(item.value, 1), searchField(item.description, 2)])
      return score === null ? [] : [{ item, score }]
    })
    return [{ id: 'found', label: null, items: found.sort((a, b) => a.score - b.score).map(({ item }) => item) }]
  }
  const favorite = (item: ModelInfo) => store.isFavorite(props.agent, item.value)
  const starred = models.value.filter(favorite)
  if (!starred.length) return [{ id: 'all', label: null, items: models.value }]
  return [
    { id: 'favorites', label: t('composer.model.favorites'), items: starred },
    { id: 'others', label: t('composer.model.others'), items: models.value.filter((item) => !favorite(item)) },
  ].filter((group) => group.items.length)
})
const empty = computed(() => groups.value.every((group) => !group.items.length))

function choose(value: unknown) {
  if (typeof value === 'string') model.value = value
  open.value = false
}

function onCloseAutoFocus(event: Event) {
  if (!props.focusAfter) return
  event.preventDefault()
  props.focusAfter()
}

const item =
  'group/item flex h-8 cursor-pointer items-center gap-2 rounded-md ps-2 pe-1 text-content/80 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content'
</script>

<template>
  <UiTooltip :label="t('composer.model.menu', { agent: agentName })">
    <span class="flex min-w-0">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          :disabled="disabled || !models.length"
          class="group flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-selection ps-1.5 pe-2 text-xs whitespace-nowrap text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-selection-hover"
        >
          <span class="sr-only">{{ t('composer.model.menu', { agent: agentName }) }}</span>
          <SettingsAgentLogo :id="agent" small class="-mx-0.5" />
          <span class="min-w-0 truncate">{{ current?.label ?? agentName }}</span>
          <ChevronDown
            class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            side="top"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 w-80 text-xs text-content select-none"
            @close-auto-focus="onCloseAutoFocus"
          >
            <ListboxRoot
              :model-value="model ?? ''"
              highlight-on-hover
              :aria-label="t('composer.model.label')"
              @update:model-value="choose"
              @highlight="(item) => (highlighted = typeof item?.value === 'string' ? item.value : null)"
              @keydown="onKeydown"
            >
              <div class="flex h-9 items-center gap-2 border-b border-stroke px-3">
                <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <ListboxFilter
                  v-model="query"
                  auto-focus
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  writingsuggestions="false"
                  :aria-label="t('composer.model.search')"
                  :placeholder="t('composer.model.search')"
                  class="min-w-0 flex-1 bg-transparent outline-none select-text placeholder:text-muted"
                />
              </div>
              <ListboxContent class="max-h-80 overflow-y-auto p-1">
                <p v-if="empty" class="px-2 py-1.5 text-muted">{{ t('composer.model.none') }}</p>
                <ListboxGroup v-for="group in groups" :key="group.id">
                  <ListboxGroupLabel v-if="group.label" class="px-2 pt-1.5 pb-1 text-[11px] text-muted">{{ group.label }}</ListboxGroupLabel>
                  <ListboxItem v-for="option in group.items" :key="option.value" :value="option.value" :class="item">
                    <span class="grid size-3.5 shrink-0 place-items-center">
                      <Check v-if="option.value === model" class="size-3" aria-hidden="true" />
                    </span>
                    <span class="max-w-2/3 shrink-0 truncate">
                      {{ option.label }}
                      <span v-if="option.value === catalog?.defaultModel" class="text-muted"> · {{ t('composer.default') }}</span>
                    </span>
                    <span class="min-w-0 flex-1 truncate text-muted">{{ option.description }}</span>
                    <!-- Étoile hors du choix : un clic la bascule sans choisir le modèle. -->
                    <button
                      type="button"
                      tabindex="-1"
                      class="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:text-content"
                      :class="store.isFavorite(agent, option.value) ? 'text-warning!' : 'opacity-0 group-hover/item:opacity-100 group-data-[highlighted]/item:opacity-100'"
                      :aria-label="t(store.isFavorite(agent, option.value) ? 'composer.model.unfavorite' : 'composer.model.favorite', { model: option.label })"
                      :aria-pressed="store.isFavorite(agent, option.value)"
                      @pointerdown.stop
                      @click.stop.prevent="store.toggleFavorite(agent, option.value)"
                    >
                      <Star class="size-3.5" :class="{ 'fill-current': store.isFavorite(agent, option.value) }" aria-hidden="true" />
                    </button>
                  </ListboxItem>
                </ListboxGroup>
              </ListboxContent>
              <p v-if="!empty" class="border-t border-stroke px-3 py-1.5 text-[11px] text-muted">
                {{ t('composer.model.favoriteShortcut', { shortcut: shortcuts.label('favoriteModel') }) }}
              </p>
            </ListboxRoot>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
