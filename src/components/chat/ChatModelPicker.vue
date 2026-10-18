<script setup lang="ts">
import { ChevronDown, ChevronRight, Star, Zap } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { type ComponentPublicInstance, computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatEffortBars from '@/components/chat/ChatEffortBars.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { Effort } from '@/ipc/bindings/Effort'
import type { ModelInfo } from '@/ipc/bindings/ModelInfo'
import { useCatalogStore } from '@/stores/catalog'
import { useShortcutsStore } from '@/stores/shortcuts'
import { agents } from '@/utils/agents'
import { matchScore, normalize, searchField } from '@/utils/search'

// Modèle, effort et mode rapide dans un seul menu. À droite de la colonne des vues, tout texte part du même bord (12 px).
const props = defineProps<{ agent: AgentKind; catalog: Catalog | null; disabled: boolean; focusAfter?: () => void }>()
const model = defineModel<string | null>({ required: true })
const effort = defineModel<Effort | null>('effort', { required: true })
const fast = defineModel<boolean>('fast', { required: true })

const { t } = useI18n()
const store = useCatalogStore()
const shortcuts = useShortcutsStore()
const id = useId()
const open = ref(false)
const query = ref('')
const view = ref<'favorites' | 'agent'>('agent')
const showLegacy = ref(false)
// Ligne surlignée (souris ou flèches) : le raccourci des favoris porte sur elle.
const highlighted = ref<string | null>(null)
const listbox = useTemplateRef<ComponentPublicInstance>('listbox')

const agentName = computed(() => agents[props.agent].name)
const models = computed(() => props.catalog?.models ?? [])
const current = computed(() => models.value.find((item) => item.value === model.value) ?? null)
const efforts = computed(() => current.value?.efforts ?? [])
const level = computed(() => (effort.value ? efforts.value.indexOf(effort.value) : -1))
const effortOptions = computed(() => efforts.value.map((value) => ({ value, label: t(`composer.effort.${value}`) })))
const isFavorite = (value: string) => store.isFavorite(props.agent, value)
const starred = computed(() => models.value.filter((item) => isFavorite(item.value)))
const recent = computed(() => models.value.filter((item) => !item.legacy))
const legacy = computed(() => models.value.filter((item) => item.legacy))

// Valeur de la ligne « Anciens modèles » : jamais confondue avec un modèle.
const LEGACY = '\0legacy'
const searched = computed(() => {
  const needle = normalize(query.value)
  if (!needle) return null
  const found = models.value.flatMap((item) => {
    if (normalize(item.label).startsWith(needle)) return [{ item, score: -1 }]
    const score = matchScore(needle, [searchField(item.label, 0), searchField(item.value, 1)])
    return score === null ? [] : [{ item, score }]
  })
  return found.sort((a, b) => a.score - b.score).map(({ item }) => item)
})
type Entry = { kind: 'model'; item: ModelInfo } | { kind: 'legacy' }
const entries = computed<Entry[]>(() => {
  const asRows = (list: ModelInfo[]) => list.map((item) => ({ kind: 'model' as const, item }))
  if (searched.value) return asRows(searched.value)
  if (view.value === 'favorites') return asRows(starred.value)
  if (!legacy.value.length) return asRows(recent.value)
  return [...asRows(recent.value), { kind: 'legacy' }, ...(showLegacy.value ? asRows(legacy.value) : [])]
})

// Hauteur fixée sur la vue de l'agent repliée : changer d'onglet, chercher ou déplier ne redimensionne pas le
// menu, qui s'ouvre vers le haut et sauterait à chaque fois.
const ROW = 32
const listHeight = computed(() => {
  const rows = Math.min(8, Math.max(4, recent.value.length + (legacy.value.length ? 1 : 0)))
  return rows * ROW + (rows - 1) * 2 + 8
})

const listElement = () => listbox.value?.$el as HTMLElement | undefined
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

watch(open, async (value) => {
  if (!value) {
    query.value = ''
    highlighted.value = null
    return
  }
  // Ouvert là où se trouve le modèle choisi.
  const inFavorites = current.value ? isFavorite(current.value.value) : starred.value.length > 0
  view.value = inFavorites ? 'favorites' : 'agent'
  showLegacy.value = view.value === 'agent' && !!current.value?.legacy
  await nextTick()
  requestAnimationFrame(() => {
    const list = listElement()
    const chosen = list?.querySelector<HTMLElement>('[data-state="checked"]')
    if (list && chosen && chosen.offsetTop + ROW > list.clientHeight) list.scrollTop = chosen.offsetTop - list.clientHeight / 2 + ROW / 2
  })
})

function show(next: 'favorites' | 'agent') {
  view.value = next
  query.value = ''
  listElement()?.scrollTo({ top: 0 })
}

async function toggleLegacy() {
  showLegacy.value = !showLegacy.value
  if (!showLegacy.value) return
  await nextTick()
  // La ligne monte en haut de la liste : les anciens modèles dépliés apparaissent sous elle.
  const list = listElement()
  const header = list?.querySelector<HTMLElement>('[data-legacy]')
  if (list && header) list.scrollTo({ top: header.offsetTop - 4, behavior: smooth() })
}

function choose(value: unknown) {
  if (value === LEGACY) {
    void toggleLegacy()
    return
  }
  if (typeof value === 'string') model.value = value
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (!highlighted.value || highlighted.value === LEGACY || !shortcuts.matches(event, 'favoriteModel')) return
  event.preventDefault()
  store.toggleFavorite(props.agent, highlighted.value)
}

// Sans ça, reka donne d'abord le focus au premier bouton (l'étoile) : son infobulle s'ouvre puis disparaît quand
// la recherche prend le focus.
function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  const content = event.target as HTMLElement | null
  content?.querySelector<HTMLInputElement>('input')?.focus()
}

function onCloseAutoFocus(event: Event) {
  if (!props.focusAfter) return
  event.preventDefault()
  props.focusAfter()
}

const tab =
  'group/tab grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-selection aria-pressed:text-content'
const row =
  'group/item flex h-8 shrink-0 items-center gap-2 rounded-md ps-2 pe-1 text-content/80 outline-none data-[highlighted]:text-content data-[highlighted]:not-data-[state=checked]:bg-selection-hover data-[state=checked]:bg-selection data-[state=checked]:text-content'
</script>

<template>
  <UiTooltip :label="t('composer.model.menu')" :disabled="open" side="top">
    <span class="flex min-w-0">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          :disabled="disabled || !models.length"
          class="group flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap text-content/85 hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-selection-hover data-[state=open]:text-content"
        >
          <span class="sr-only">{{ t('composer.model.menu') }}</span>
          <SettingsAgentLogo :id="agent" small class="-ms-0.5" />
          <span class="min-w-0 truncate">{{ current?.label ?? agentName }}</span>
          <template v-if="effort && efforts.length">
            <ChatEffortBars :level="level + 1" :count="efforts.length" />
            <span class="sr-only">{{ t('composer.effort.current', { effort: t(`composer.effort.${effort}`) }) }}</span>
          </template>
          <template v-if="fast && current?.fast">
            <Zap class="size-3 shrink-0 fill-current text-warning" aria-hidden="true" />
            <span class="sr-only">{{ t('composer.fast.label') }}</span>
          </template>
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
            class="ui-pop z-50 flex w-80 text-xs text-content select-none"
            @open-auto-focus="onOpenAutoFocus"
            @close-auto-focus="onCloseAutoFocus"
          >
            <!-- Colonne des vues : Favoris, puis un bouton par agent. Ses boutons ne prennent pas le focus à la souris,
                 les flèches restent dans la recherche. -->
            <div class="flex w-11 shrink-0 flex-col items-center gap-1 bg-content/4 py-1" role="group" :aria-label="t('composer.model.label')">
              <UiTooltip :label="t('composer.model.favorites')" side="left">
                <button type="button" :class="tab" :aria-pressed="view === 'favorites' && !query" @mousedown.prevent @click="show('favorites')">
                  <Star class="size-4 group-aria-pressed/tab:fill-current group-aria-pressed/tab:text-warning" aria-hidden="true" />
                  <span class="sr-only">{{ t('composer.model.favorites') }}</span>
                </button>
              </UiTooltip>
              <span class="h-px w-5 shrink-0 bg-stroke" aria-hidden="true" />
              <UiTooltip :label="agentName" side="left">
                <button type="button" :class="tab" :aria-pressed="view === 'agent' && !query" @mousedown.prevent @click="show('agent')">
                  <SettingsAgentLogo
                    :id="agent"
                    small
                    class="opacity-60 grayscale group-hover/tab:opacity-100 group-aria-pressed/tab:opacity-100 group-aria-pressed/tab:grayscale-0"
                  />
                  <span class="sr-only">{{ agentName }}</span>
                </button>
              </UiTooltip>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <ListboxRoot
                :model-value="model ?? ''"
                highlight-on-hover
                :aria-label="t('composer.model.label')"
                @update:model-value="choose"
                @highlight="(item) => (highlighted = typeof item?.value === 'string' ? item.value : null)"
                @keydown="onKeydown"
              >
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
                  class="block h-10 w-full bg-transparent px-3 outline-none select-text placeholder:text-muted"
                />
                <div class="h-px bg-stroke" aria-hidden="true" />
                <ListboxContent ref="listbox" class="relative flex flex-col gap-0.5 overflow-y-auto overscroll-contain p-1" :style="{ height: `${listHeight}px` }">
                  <p v-if="!entries.length" class="flex h-8 shrink-0 items-center px-2 text-muted">
                    {{ view === 'favorites' && !query ? t('composer.model.noFavorites') : t('composer.model.none') }}
                  </p>
                  <template v-for="entry in entries" :key="entry.kind === 'model' ? entry.item.value : LEGACY">
                    <ListboxItem
                      v-if="entry.kind === 'legacy'"
                      :value="LEGACY"
                      data-legacy
                      :aria-expanded="showLegacy"
                      :class="[row, 'text-muted']"
                      @mousedown.prevent
                    >
                      <span class="min-w-0 truncate">{{ t('composer.model.legacy') }}</span>
                      <span class="shrink-0 text-[11px] tabular-nums opacity-70">{{ legacy.length }}</span>
                      <span class="ms-auto grid size-5.5 shrink-0 place-items-center" aria-hidden="true">
                        <ChevronRight
                          class="size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none rtl:rotate-180"
                          :class="{ 'rotate-90!': showLegacy }"
                        />
                      </span>
                    </ListboxItem>
                    <ListboxItem v-else :value="entry.item.value" :class="row" @mousedown.prevent>
                      <span class="min-w-0 truncate">{{ entry.item.label }}</span>
                      <span v-if="entry.item.value === catalog?.defaultModel" class="shrink-0 text-[11px] text-muted">{{ t('composer.default') }}</span>
                      <!-- Étoile hors du choix : un clic la bascule sans choisir le modèle. -->
                      <button
                        type="button"
                        tabindex="-1"
                        class="ms-auto grid size-5.5 shrink-0 place-items-center rounded-md"
                        :class="
                          isFavorite(entry.item.value)
                            ? 'text-warning'
                            : 'text-muted opacity-0 hover:text-content group-hover/item:opacity-100 group-data-[highlighted]/item:opacity-100'
                        "
                        :aria-label="t(isFavorite(entry.item.value) ? 'composer.model.unfavorite' : 'composer.model.favorite', { model: entry.item.label })"
                        :aria-pressed="isFavorite(entry.item.value)"
                        @click.stop.prevent="store.toggleFavorite(agent, entry.item.value)"
                      >
                        <Star class="size-3.5" :class="{ 'fill-current': isFavorite(entry.item.value) }" aria-hidden="true" />
                      </button>
                    </ListboxItem>
                  </template>
                </ListboxContent>
              </ListboxRoot>
              <template v-if="efforts.length || current?.fast">
                <div class="h-px bg-stroke" aria-hidden="true" />
                <div class="px-3 py-1">
                  <div v-if="efforts.length" class="pb-2">
                    <p class="flex h-8 items-center justify-between gap-2">
                      <span class="text-content/80">{{ t('composer.effort.label') }}</span>
                      <span class="text-muted">{{ effort ? t(`composer.effort.${effort}`) : '' }}</span>
                    </p>
                    <UiSlider
                      :model-value="effort ?? effortOptions[0]?.value ?? ''"
                      :options="effortOptions"
                      :label="t('composer.effort.label')"
                      @update:model-value="(value) => (effort = value as Effort)"
                    />
                  </div>
                  <div v-if="current?.fast" class="flex h-8 items-center justify-between gap-2">
                    <label :for="`${id}-fast`" class="text-content/80">{{ t('composer.fast.label') }}</label>
                    <span :id="`${id}-fast-hint`" class="sr-only">{{ t('composer.fast.hint') }}</span>
                    <UiSwitch :id="`${id}-fast`" v-model="fast" :label="t('composer.fast.label')" :aria-describedby="`${id}-fast-hint`" />
                  </div>
                </div>
              </template>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
