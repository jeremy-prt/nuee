<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import ShellPinnedDeck from '@/components/shell/ShellPinnedDeck.vue'
import ShellTab from '@/components/shell/ShellTab.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { useWorkspaceStore } from '@/stores/workspace'
import { normalize } from '@/utils/search'
import { isMac } from '@/utils/shortcuts'

// Bande d'onglets de la barre de titre, comme Orca : au-delà de ce que la largeur permet, elle défile par ses flèches,
// la molette verticale ou la liste de tous les onglets. Pas de défilement au trackpad seul : les utilitaires de fenêtres
// (Swish) captent ce geste sur une barre de titre.
const { t } = useI18n()
const workspace = useWorkspaceStore()
const { tabTitle } = useTabTitle()

// Épinglés en tête de la bande (`stripTabs`), dans leur pile hors du défilement.
const pinnedCount = computed(() => workspace.pinnedTabs.length)
const strip = useTemplateRef<HTMLElement>('strip')
const overflow = ref(false)
const atStart = ref(true)
const atEnd = ref(true)

function measure() {
  const el = strip.value
  if (!el) return
  overflow.value = el.scrollWidth > el.clientWidth + 1
  atStart.value = el.scrollLeft <= 1
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
}
// La largeur change avec la fenêtre, les colonnes et les titres : relue à chaque redimensionnement de la bande.
const observer = new ResizeObserver(measure)
onMounted(() => strip.value && observer.observe(strip.value))
onBeforeUnmount(() => observer.disconnect())
watch(() => workspace.stripTabs.length, () => nextTick(measure))

function page(direction: 1 | -1) {
  const el = strip.value
  if (el) el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.75), behavior: 'smooth' })
}

function wheel(event: WheelEvent) {
  const el = strip.value
  if (!el || !overflow.value || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  el.scrollLeft += event.deltaY
  event.preventDefault()
}

// L'onglet actif reste toujours visible : ouvert depuis la liste, un raccourci ou la barre latérale.
watch(
  () => workspace.activeTabId,
  async (id) => {
    await nextTick()
    strip.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  },
)

// ⌘ (Ctrl hors Mac) tenu : chaque onglet montre son chiffre de ⌘1…9, comme Paseo et T3 Code.
const numbered = ref(false)
// macOS ne renvoie pas toujours le relâchement de ⌘ après un raccourci : la souris qui bouge le relit aussi.
function onModifier(event: KeyboardEvent | MouseEvent) {
  numbered.value = isMac ? event.metaKey : event.ctrlKey
}
const hideNumbers = () => (numbered.value = false)
onMounted(() => {
  window.addEventListener('keydown', onModifier)
  window.addEventListener('keyup', onModifier)
  window.addEventListener('mousemove', onModifier)
  window.addEventListener('blur', hideNumbers)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onModifier)
  window.removeEventListener('keyup', onModifier)
  window.removeEventListener('mousemove', onModifier)
  window.removeEventListener('blur', hideNumbers)
})
function rank(index: number) {
  const count = workspace.stripTabs.length
  if (index === count - 1 && count > 8) return 9
  return index < 8 ? index + 1 : null
}

const listOpen = ref(false)
const query = ref('')
watch(listOpen, (open) => {
  if (!open) query.value = ''
})
const listed = computed(() => {
  const needle = normalize(query.value.trim())
  const tabs = workspace.stripTabs
  return needle ? tabs.filter((tab) => normalize(tabTitle(tab)).includes(needle)) : tabs
})

function pick(value: unknown) {
  if (typeof value === 'string') workspace.openTab(value)
  listOpen.value = false
}

const item =
  'flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-content/80 outline-none data-[highlighted]:not-data-[state=checked]:bg-selection-hover data-[highlighted]:text-content data-[state=checked]:bg-selection data-[state=checked]:text-content'
</script>

<template>
  <div class="flex h-full min-w-0 items-center gap-0.5" data-tauri-drag-region>
    <ShellPinnedDeck class="me-1" :numbered="numbered" :rank="rank" />
    <UiIconButton v-if="overflow" :label="t('workspace.scrollLeft')" :disabled="atStart" @click="page(-1)">
      <ChevronLeft class="size-3.5" aria-hidden="true" />
    </UiIconButton>
    <div
      ref="strip"
      role="tablist"
      data-tab-strip
      :aria-label="t('workspace.tabs')"
      class="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
      data-tauri-drag-region
      @scroll.passive="measure"
      @wheel="wheel"
    >
      <!-- `index` et `count` ne comptent que les onglets non épinglés : ce sont eux que « Fermer à droite »… parcourt. -->
      <ShellTab
        v-for="(tab, index) in workspace.stripTabs.slice(pinnedCount)"
        :key="tab.id"
        :tab="tab"
        :index="index"
        :count="workspace.stripTabs.length - pinnedCount"
        :rank="numbered ? rank(index + pinnedCount) : null"
      />
    </div>
    <template v-if="overflow">
      <UiIconButton :label="t('workspace.scrollRight')" :disabled="atEnd" @click="page(1)">
        <ChevronRight class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiTooltip :label="t('workspace.allTabs')" :disabled="listOpen">
        <span class="flex">
          <PopoverRoot v-model:open="listOpen">
            <PopoverTrigger
              class="group flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted tabular-nums hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-selection-hover data-[state=open]:text-content"
              :aria-label="t('workspace.allTabs')"
            >
              {{ workspace.stripTabs.length }}
              <ChevronDown class="size-3 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent side="bottom" align="end" :side-offset="6" :collision-padding="8" class="ui-pop z-50 w-72 text-xs text-content select-none">
                <ListboxRoot :model-value="workspace.activeTabId ?? ''" highlight-on-hover :aria-label="t('workspace.allTabs')" @update:model-value="pick">
                  <label class="flex h-9 items-center gap-2 border-b border-stroke px-3 text-muted">
                    <Search class="size-3.5 shrink-0" aria-hidden="true" />
                    <ListboxFilter
                      v-model="query"
                      auto-focus
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      spellcheck="false"
                      writingsuggestions="false"
                      :aria-label="t('workspace.searchTabs')"
                      :placeholder="t('workspace.searchTabs')"
                      class="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none select-text placeholder:text-muted"
                    />
                  </label>
                  <ListboxContent class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1">
                    <ListboxItem v-for="tab in listed" :key="tab.id" :value="tab.id" :class="item">
                      <SettingsAgentLogo :id="tab.agent" tiny />
                      <span class="min-w-0 flex-1 truncate">{{ tabTitle(tab) }}</span>
                    </ListboxItem>
                  </ListboxContent>
                </ListboxRoot>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
        </span>
      </UiTooltip>
    </template>
  </div>
</template>
