<script setup lang="ts">
import { ChevronDown, ChevronRight, Star, Zap } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
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

// Comme monocode : trois lignes qu'on comprend tout de suite (mode rapide, effort, modèle), les deux dernières
// ouvrent leur liste à droite, au survol ou au clic.
const props = defineProps<{ agent: AgentKind; catalog: Catalog | null; disabled: boolean; focusAfter?: () => void }>()
const model = defineModel<string | null>({ required: true })
const effort = defineModel<Effort | null>('effort', { required: true })
const fast = defineModel<boolean>('fast', { required: true })

const { t } = useI18n()
const store = useCatalogStore()
const shortcuts = useShortcutsStore()
const id = useId()
const open = ref(false)
const sub = ref<'effort' | 'model' | null>(null)
const query = ref('')
const view = ref<'favorites' | 'agent'>('agent')
// Ligne surlignée (souris ou flèches) : le raccourci des favoris porte sur elle.
const highlighted = ref<string | null>(null)

const agentName = computed(() => agents[props.agent].name)
const models = computed(() => props.catalog?.models ?? [])
const current = computed(() => models.value.find((item) => item.value === model.value) ?? null)
const efforts = computed(() => current.value?.efforts ?? [])
const isFavorite = (value: string) => store.isFavorite(props.agent, value)
const starred = computed(() => models.value.filter((item) => isFavorite(item.value)))
const main = computed(() => models.value.filter((item) => !item.legacy))
const legacy = computed(() => models.value.filter((item) => item.legacy))

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
// Les modèles principaux, puis les anciens sous leur titre ; la recherche et les favoris donnent une liste simple.
const groups = computed<{ title?: string; items: ModelInfo[] }[]>(() => {
  if (searched.value) return [{ items: searched.value }]
  if (view.value === 'favorites') return [{ items: starred.value }]
  return [{ items: main.value }, ...(legacy.value.length ? [{ title: t('composer.model.legacy'), items: legacy.value }] : [])]
})
const empty = computed(() => groups.value.every((group) => !group.items.length))

watch(open, (value) => {
  if (value) return
  sub.value = null
  clearTimeout(subTimer)
})
watch(sub, (value) => {
  if (value !== 'model') {
    query.value = ''
    highlighted.value = null
    return
  }
  // Ouvert là où se trouve le modèle choisi.
  view.value = current.value && isFavorite(current.value.value) ? 'favorites' : 'agent'
})

// Les listes s'ouvrent au survol comme des sous-menus ; le délai de fermeture laisse le temps de les rejoindre.
let subTimer: ReturnType<typeof setTimeout> | undefined
function hoverSub(next: 'effort' | 'model' | null, inside = true) {
  clearTimeout(subTimer)
  subTimer = setTimeout(
    () => {
      if (inside) sub.value = next
      else if (sub.value === next) sub.value = null
    },
    inside ? 80 : 250,
  )
}
onBeforeUnmount(() => clearTimeout(subTimer))

// reka ouvre et ferme la liste au clic : déjà ouverte au survol, un clic la refermerait sous le pointeur.
function keepOpen(event: MouseEvent, which: 'effort' | 'model') {
  clearTimeout(subTimer)
  if (sub.value === which) event.stopImmediatePropagation()
}

function chooseModel(value: unknown) {
  if (typeof value === 'string') model.value = value
  open.value = false
}

function chooseEffort(value: Effort) {
  effort.value = value
  sub.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (!highlighted.value || !shortcuts.matches(event, 'favoriteModel')) return
  event.preventDefault()
  store.toggleFavorite(props.agent, highlighted.value)
}

// reka donnerait le focus au premier bouton de la liste (l'étoile des favoris) : la recherche le prend.
function focusSearch(event: Event) {
  event.preventDefault()
  ;(event.target as HTMLElement | null)?.querySelector<HTMLInputElement>('input')?.focus()
}

function focusChosenEffort(event: Event) {
  event.preventDefault()
  const content = event.target as HTMLElement | null
  ;(content?.querySelector<HTMLElement>('[aria-checked="true"]') ?? content?.querySelector<HTMLElement>('button'))?.focus()
}

// Un sous-menu qui se ferme ne rend pas le focus à sa ligne : en passant à l'autre, celui qui s'ouvre prendrait ce
// focus pour un clic dehors et se refermerait. Seul Échap, au clavier, ramène sur la ligne.
const effortRow = useTemplateRef<{ $el: HTMLElement }>('effortRow')
const modelRow = useTemplateRef<{ $el: HTMLElement }>('modelRow')
function backTo(row: { $el: HTMLElement } | null) {
  nextTick(() => row?.$el.focus())
}

function onCloseAutoFocus(event: Event) {
  if (!props.focusAfter) return
  event.preventDefault()
  props.focusAfter()
}

// Seul l'effort Max est en couleur, pour qu'on le remarque (choix de Jérémy). `soft` : dans la liste, les autres
// niveaux gardent la couleur du texte.
function effortTone(value: Effort, soft = false) {
  if (value === 'max') return 'text-violet'
  return soft ? '' : 'text-muted'
}

const line =
  'flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-[13px] text-content outline-none hover:bg-selection-hover focus-visible:bg-selection-hover aria-expanded:bg-selection-hover'
const tab =
  'group/tab grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-selection aria-pressed:text-content'
const row =
  'group/item flex h-8 shrink-0 items-center gap-2 rounded-md ps-2 pe-1 text-content/80 outline-none data-[highlighted]:text-content data-[highlighted]:not-data-[state=checked]:bg-selection-hover data-[state=checked]:bg-selection data-[state=checked]:text-content'
const flyout = 'ui-pop z-50 text-xs text-content select-none'
</script>

<template>
  <UiTooltip :label="t('composer.model.menu')" :disabled="open" side="top">
    <span class="flex min-w-0">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          :disabled="disabled || !models.length"
          class="group flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap text-content/85 hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-selection-inner data-[state=open]:text-content"
        >
          <span class="sr-only">{{ t('composer.model.menu') }}</span>
          <SettingsAgentLogo :id="agent" small class="-ms-0.5" />
          <span class="min-w-0 truncate">{{ current?.label ?? agentName }}</span>
          <span v-if="effort && efforts.length" class="shrink-0" :class="effortTone(effort)">{{ t(`composer.effort.${effort}`) }}</span>
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
            :class="[flyout, 'flex w-64 flex-col gap-0.5 p-1.5']"
            @close-auto-focus="onCloseAutoFocus"
          >
            <label v-if="current?.fast" :for="`${id}-fast`" :class="[line, 'cursor-pointer']" @pointerenter="hoverSub(null)">
              <span class="min-w-0 flex-1 truncate">{{ t('composer.fast.label') }}</span>
              <span :id="`${id}-fast-hint`" class="sr-only">{{ t('composer.fast.hint') }}</span>
              <UiSwitch :id="`${id}-fast`" v-model="fast" :label="t('composer.fast.label')" :aria-describedby="`${id}-fast-hint`" />
            </label>

            <PopoverRoot v-if="efforts.length" :open="sub === 'effort'" @update:open="(value) => (sub = value ? 'effort' : null)">
              <PopoverTrigger
                ref="effortRow"
                :class="line"
                @pointerenter="hoverSub('effort')"
                @pointerleave="hoverSub('effort', false)"
                @click.capture="keepOpen($event, 'effort')"
                @keydown.right.prevent="sub = 'effort'"
              >
                <span class="min-w-0 flex-1 truncate">{{ t('composer.effort.label') }}</span>
                <span class="shrink-0" :class="effort ? effortTone(effort) : ''">{{ effort ? t(`composer.effort.${effort}`) : '' }}</span>
                <ChevronRight class="size-3.5 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent
                  side="right"
                  align="start"
                  :side-offset="10"
                  :collision-padding="8"
                  :class="[flyout, 'w-44 p-1.5']"
                  @open-auto-focus="focusChosenEffort"
                  @close-auto-focus.prevent
                  @escape-key-down="backTo(effortRow)"
                  @pointerenter="hoverSub('effort')"
                  @pointerleave="hoverSub('effort', false)"
                >
                  <div class="flex flex-col gap-0.5" role="radiogroup" :aria-label="t('composer.effort.label')">
                    <button
                      v-for="value in efforts"
                      :key="value"
                      type="button"
                      role="radio"
                      :aria-checked="value === effort"
                      :class="[line, 'aria-checked:bg-selection']"
                      @click="chooseEffort(value)"
                    >
                      <span :class="effortTone(value, true)">{{ t(`composer.effort.${value}`) }}</span>
                    </button>
                  </div>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>

            <PopoverRoot :open="sub === 'model'" @update:open="(value) => (sub = value ? 'model' : null)">
              <PopoverTrigger
                ref="modelRow"
                :class="line"
                @pointerenter="hoverSub('model')"
                @pointerleave="hoverSub('model', false)"
                @click.capture="keepOpen($event, 'model')"
                @keydown.right.prevent="sub = 'model'"
              >
                <span class="min-w-0 flex-1 truncate">{{ t('composer.model.label') }}</span>
                <SettingsAgentLogo :id="agent" small />
                <span class="max-w-28 shrink-0 truncate text-muted">{{ current?.label ?? agentName }}</span>
                <ChevronRight class="size-3.5 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent
                  side="right"
                  align="start"
                  :side-offset="10"
                  :collision-padding="8"
                  :class="[flyout, 'flex w-80']"
                  @open-auto-focus="focusSearch"
                  @close-auto-focus.prevent
                  @escape-key-down="backTo(modelRow)"
                  @pointerenter="hoverSub('model')"
                  @pointerleave="hoverSub('model', false)"
                >
                  <!-- Colonne des vues : Favoris, puis un bouton par agent. Ses boutons ne prennent pas le focus à la
                       souris, les flèches restent dans la recherche. -->
                  <div class="flex w-11 shrink-0 flex-col items-center gap-1 bg-content/4 py-1" role="group" :aria-label="t('composer.model.label')">
                    <UiTooltip :label="t('composer.model.favorites')" side="left">
                      <button type="button" :class="tab" :aria-pressed="view === 'favorites' && !query" @mousedown.prevent @click="view = 'favorites'">
                        <Star class="size-4 group-aria-pressed/tab:fill-current group-aria-pressed/tab:text-warning" aria-hidden="true" />
                        <span class="sr-only">{{ t('composer.model.favorites') }}</span>
                      </button>
                    </UiTooltip>
                    <span class="h-px w-5 shrink-0 bg-stroke" aria-hidden="true" />
                    <UiTooltip :label="agentName" side="left">
                      <button type="button" :class="tab" :aria-pressed="view === 'agent' && !query" @mousedown.prevent @click="view = 'agent'">
                        <SettingsAgentLogo
                          :id="agent"
                          small
                          class="opacity-60 grayscale group-hover/tab:opacity-100 group-aria-pressed/tab:opacity-100 group-aria-pressed/tab:grayscale-0"
                        />
                        <span class="sr-only">{{ agentName }}</span>
                      </button>
                    </UiTooltip>
                  </div>
                  <ListboxRoot
                    class="flex min-w-0 flex-1 flex-col"
                    :model-value="model ?? ''"
                    highlight-on-hover
                    :aria-label="t('composer.model.label')"
                    @update:model-value="chooseModel"
                    @highlight="(item) => (highlighted = typeof item?.value === 'string' ? item.value : null)"
                    @keydown="onKeydown"
                  >
                    <ListboxFilter
                      v-model="query"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      spellcheck="false"
                      writingsuggestions="false"
                      :aria-label="t('composer.model.search')"
                      :placeholder="t('composer.model.search')"
                      class="block h-10 w-full shrink-0 bg-transparent px-3 outline-none select-text placeholder:text-muted"
                    />
                    <div class="h-px shrink-0 bg-stroke" aria-hidden="true" />
                    <!-- Hauteur fixe : passer aux favoris (souvent peu nombreux) ne rétrécit pas le menu, sinon il fuit le pointeur et se ferme. -->
                    <ListboxContent class="flex h-60 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1 pb-2">
                      <p v-if="empty" class="flex h-8 shrink-0 items-center px-2 text-muted">
                        {{ view === 'favorites' && !query ? t('composer.model.noFavorites') : t('composer.model.none') }}
                      </p>
                      <template v-for="(group, index) in groups" :key="index">
                        <!-- Même titre que « Sessions » dans la barre latérale : pas de capitales espacées (choix de Jérémy). -->
                        <p v-if="group.title && group.items.length" class="mt-2 px-2 pt-1 pb-1 text-xs font-medium text-muted" role="presentation">{{ group.title }}</p>
                        <ListboxItem v-for="item in group.items" :key="item.value" :value="item.value" :class="row" @mousedown.prevent>
                          <span class="min-w-0 truncate">{{ item.label }}</span>
                          <span v-if="item.value === catalog?.defaultModel" class="shrink-0 text-[11px] text-muted">{{ t('composer.default') }}</span>
                          <!-- Étoile hors du choix : un clic la bascule sans choisir le modèle. -->
                          <button
                            type="button"
                            tabindex="-1"
                            class="ms-auto grid size-6 shrink-0 place-items-center rounded-md hover:bg-selection-inner"
                            :class="
                              isFavorite(item.value)
                                ? 'text-warning'
                                : 'text-muted opacity-0 hover:text-content group-hover/item:opacity-100 group-data-[highlighted]/item:opacity-100'
                            "
                            :aria-label="t(isFavorite(item.value) ? 'composer.model.unfavorite' : 'composer.model.favorite', { model: item.label })"
                            :aria-pressed="isFavorite(item.value)"
                            @click.stop.prevent="store.toggleFavorite(agent, item.value)"
                          >
                            <Star class="size-3.5" :class="{ 'fill-current': isFavorite(item.value) }" aria-hidden="true" />
                          </button>
                        </ListboxItem>
                      </template>
                    </ListboxContent>
                  </ListboxRoot>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
