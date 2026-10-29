<script setup lang="ts">
import { ChevronDown, ChevronRight, NoProject, Plus, Search, Settings, SlidersHorizontal } from '@/components/ui/icons'
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  ListboxContent,
  ListboxFilter,
  ListboxItem,
  ListboxRoot,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import { computed, onBeforeUnmount, ref, toRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import ProjectMenu from '@/components/project/ProjectMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuLabel, menuPanel, menuRow } from '@/components/ui/menuRow'
import { useAddProject } from '@/composables/useAddProject'
import { useProjectActions } from '@/composables/useProjectActions'
import { useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { normalize } from '@/utils/search'

// En haut à gauche de « Projets en menu » : le projet en cours, et la liste pour passer à un autre ou aux « Sessions libres ».
// Ses réglages : la roue de chaque ligne ouvre sa page (comme T3 Code) ; « Réglages rapides », en bas, ouvre le
// menu du clic droit (comme « Project settings » de monocode), qui mène aussi à la page.
const { t } = useI18n()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const actions = useProjectActions()
const shortcuts = useShortcutsStore()
const pickProject = useAddProject()
const open = toRef(navigation, 'switcherOpen')
const query = ref('')

const current = computed(() => projects.byId(navigation.projectId))
const noneLabel = computed(() => t('rail.chats'))
const shown = computed(() => {
  const needle = normalize(query.value)
  return needle ? projects.ordered.filter((project) => normalize(project.name).includes(needle)) : projects.ordered
})
const showNone = computed(() => !query.value.trim() || normalize(noneLabel.value).includes(normalize(query.value)))


// Listbox en valeurs texte : '' vaut les « Sessions libres ». Rechoisir le projet en cours ramène à ses sessions.
function choose(value: unknown) {
  if (typeof value === 'string') navigation.openChats(value || null)
  open.value = false
}

function openSettings(project: Project) {
  open.value = false
  actions.openSettings(project)
}

async function addProject() {
  open.value = false
  const project = await pickProject()
  if (project) navigation.openChats(project.id)
}

// « Réglages rapides » s'ouvre au survol comme un sous-menu ; le délai de fermeture laisse le temps de rejoindre
// le menu. Ouvert à la souris, il ne prend pas le focus (le champ de recherche le garde).
const quickOpen = ref(false)
let quickByPointer = false
let quickTimer: ReturnType<typeof setTimeout> | undefined

function hoverQuick(inside: boolean) {
  clearTimeout(quickTimer)
  quickTimer = setTimeout(
    () => {
      if (inside) quickByPointer = true
      quickOpen.value = inside
    },
    inside ? 80 : 250,
  )
}

// Un clic sur l'entrée déjà ouverte au survol ne doit pas la refermer.
function keepQuickOpen(event: MouseEvent) {
  if (quickOpen.value) event.preventDefault()
}

// reka rend le focus à la page, pas à l'entrée, quand on referme au clavier (Échap) : on l'y remet.
const quickTrigger = useTemplateRef<{ $el: HTMLElement }>('quickTrigger')
function onQuickCloseFocus(event: Event) {
  event.preventDefault()
  if (!quickByPointer) quickTrigger.value?.$el.focus()
}

function openQuickByKeyboard() {
  quickByPointer = false
  quickOpen.value = true
}

watch(open, (value) => {
  if (value) return
  query.value = ''
  clearTimeout(quickTimer)
  quickOpen.value = false
})
onBeforeUnmount(() => clearTimeout(quickTimer))

// Toutes les lignes à 32 px, contenu centré : la roue des projets les rendait plus hautes que « Sessions libres »,
// et `items-start` de menuRow remontait leur icône.
const row = [menuRow.replace('items-start', 'items-center'), 'h-8']
</script>

<template>
  <UiContextMenu :disabled="!current">
    <UiTooltip :label="t('rail.switchProject')" :shortcut="shortcuts.label('switchProject')" :disabled="open">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          class="group flex h-7 max-w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-selection-hover"
          :aria-label="`${t('rail.switchProject')}, ${current?.name ?? noneLabel}`"
        >
          <ProjectIcon v-if="current" :project="current" class="size-4 shrink-0 rounded-sm" />
          <NoProject v-else class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ current?.name ?? noneLabel }}</span>
          <ChevronDown
            class="size-3.5 shrink-0 text-muted transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            side="bottom"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 w-64 text-xs text-content select-none"
          >
            <ListboxRoot
              :model-value="navigation.projectId ?? ''"
              highlight-on-hover
              :aria-label="t('rail.switchProject')"
              @update:model-value="choose"
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
                  :aria-label="t('projectPicker.search')"
                  :placeholder="t('projectPicker.search')"
                  class="min-w-0 flex-1 bg-transparent text-[13px] outline-none select-text placeholder:text-muted"
                />
              </div>
              <ListboxContent class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5">
                <ListboxItem v-if="showNone" value="" :class="row">
                  <NoProject class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span :class="[menuLabel, 'flex-1']">{{ noneLabel }}</span>
                </ListboxItem>
                <ListboxItem v-for="project in shown" :key="project.id" :value="project.id" :class="[row, 'pe-1']">
                  <ProjectIcon :project="project" class="size-4 shrink-0 rounded-sm" />
                  <span :class="[menuLabel, 'flex-1']">{{ project.name }}</span>
                  <!-- Hors du parcours clavier, comme T3 Code : « Réglages du projet », en bas, y mène au clavier. -->
                  <UiTooltip :label="t('menu.projectSettings')" side="right" :side-offset="8">
                    <button
                      type="button"
                      tabindex="-1"
                      aria-hidden="true"
                      class="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-inner hover:text-content"
                      @pointerdown.stop
                      @pointerup.stop
                      @click.stop="openSettings(project)"
                    >
                      <Settings class="size-3.5" />
                    </button>
                  </UiTooltip>
                </ListboxItem>
                <p v-if="!shown.length && !showNone" class="px-2 py-1.5 text-[13px] text-muted">{{ t('projectPicker.none') }}</p>
              </ListboxContent>
            </ListboxRoot>
            <div class="flex flex-col gap-0.5 border-t border-stroke p-1.5">
              <DropdownMenuRoot v-if="current" v-model:open="quickOpen" :modal="false">
                <DropdownMenuTrigger
                  ref="quickTrigger"
                  @pointerenter="hoverQuick(true)"
                  @pointerleave="hoverQuick(false)"
                  @click.capture="keepQuickOpen"
                  @keydown="quickByPointer = false"
                  @keydown.right.prevent="openQuickByKeyboard"
                  class="flex h-8 w-full items-center gap-2.5 rounded-lg ps-2 pe-1.5 text-[13px] outline-none hover:bg-selection-hover focus-visible:bg-selection-hover aria-expanded:bg-selection-hover"
                >
                  <SlidersHorizontal class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate text-start">{{ t('rail.quickSettings') }}</span>
                  <ChevronRight class="size-3.5 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    :side-offset="10"
                    :collision-padding="8"
                    :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-52']"
                    @pointerenter="hoverQuick(true)"
                    @pointerleave="hoverQuick(false)"
                    @open-auto-focus="quickByPointer && $event.preventDefault()"
                    @close-auto-focus="onQuickCloseFocus"
                  >
                    <ProjectMenu :project="current" @rename="openSettings(current)" />
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <button
                type="button"
                class="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] outline-none hover:bg-selection-hover focus-visible:bg-selection-hover"
                @click="addProject()"
              >
                <Plus class="size-4 shrink-0 text-muted" aria-hidden="true" />
                {{ t('rail.addProject') }}
              </button>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </UiTooltip>
    <template v-if="current" #menu><ProjectMenu :project="current" @rename="actions.openSettings(current)" /></template>
  </UiContextMenu>
</template>
