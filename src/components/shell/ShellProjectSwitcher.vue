<script setup lang="ts">
import { ChevronRight, ChevronsUpDown, NoProject, Plus, Search, Settings, SlidersHorizontal } from '@/components/ui/icons'
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
import { computed, nextTick, onBeforeUnmount, ref, toRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import NoProjectMenu from '@/components/project/NoProjectMenu.vue'
import ProjectMenu from '@/components/project/ProjectMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiRenameField from '@/components/ui/UiRenameField.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuLabel, menuPanel, menuRow } from '@/components/ui/menuRow'
import { useAddProject } from '@/composables/useAddProject'
import { useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { normalize } from '@/utils/search'

// En haut à gauche de « Projets en menu » : le projet en cours, et la liste pour passer à un autre ou à « Sans projet ».
// La roue ou le clic droit d'une ligne ouvre son menu rapide, sans changer de projet ; « Réglages rapides », en bas,
// ouvre celui du projet en cours, et le seul accessible au clavier (comme « Project settings » de monocode).
const { t } = useI18n()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const shortcuts = useShortcutsStore()
const pickProject = useAddProject()
const open = toRef(navigation, 'switcherOpen')
const query = ref('')

const current = computed(() => projects.byId(navigation.projectId))
const noneLabel = computed(() => t('rail.chats'))
const shown = computed(() => {
  const needle = normalize(query.value)
  return needle ? projects.alphabetical.filter((project) => normalize(project.name).includes(needle)) : projects.alphabetical
})
const showNone = computed(() => !query.value.trim() || normalize(noneLabel.value).includes(normalize(query.value)))
const rows = computed(() => [
  ...(showNone.value ? [{ key: '', project: null }] : []),
  ...shown.value.map((project) => ({ key: project.id, project })),
])

// Listbox en valeurs texte : '' vaut « Sans projet ». Rechoisir le projet en cours ramène à ses sessions.
function choose(value: unknown) {
  if (typeof value === 'string') navigation.openChats(value || null)
  open.value = false
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

// Une seule ligne à la fois a son menu ouvert (clé de `rows`), ancré sur sa roue.
const rowMenu = ref<string | null>(null)
const rowRenaming = ref<string | null>(null)

function toggleRowMenu(key: string, value: boolean) {
  if (value) rowMenu.value = key
  else if (rowMenu.value === key) rowMenu.value = null
}

watch(open, (value) => {
  if (value) return
  query.value = ''
  clearTimeout(quickTimer)
  quickOpen.value = false
  rowMenu.value = null
  rowRenaming.value = null
})

const renaming = ref(false)
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')
let renameByKey = false

function startRename() {
  open.value = false
  renameByKey = false
  renaming.value = true
}

// Validé ou annulé au clavier, le champ disparaît : le focus revient au bouton du projet.
async function stopRename(name?: string) {
  renaming.value = false
  if (name && current.value) projects.rename(current.value, name)
  if (!renameByKey) return
  await nextTick()
  trigger.value?.$el.focus()
}

// Renommée depuis son menu, la ligne passe en champ et la liste reste ouverte. Validé ou annulé au clavier, le
// champ disparaît : le focus revient à la recherche.
const filter = useTemplateRef<{ $el: HTMLElement }>('filter')
let rowRenameByKey = false

function startRowRename(key: string) {
  rowRenameByKey = false
  rowRenaming.value = key
}

async function stopRowRename(project: Project, name?: string) {
  rowRenaming.value = null
  if (name) projects.rename(project, name)
  if (!rowRenameByKey) return
  await nextTick()
  filter.value?.$el.focus()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (!current.value || !shortcuts.matches(event, 'rename')) return
  event.preventDefault()
  event.stopPropagation()
  startRename()
}
onBeforeUnmount(() => clearTimeout(quickTimer))

// Toutes les lignes à 32 px, contenu centré : la roue des projets les rendait plus hautes que « Sans projet »,
// et `items-start` de menuRow remontait leur icône.
const row = [menuRow.replace('items-start', 'items-center'), 'h-8']
</script>

<template>
  <UiContextMenu :disabled="renaming">
    <div
      v-if="renaming && current"
      class="flex h-8 w-full min-w-0 items-center gap-2 rounded-md bg-selection ps-2 pe-1 text-sm font-semibold"
      @keydown.capture="renameByKey = $event.key === 'Enter' || $event.key === 'Escape'"
    >
      <ProjectIcon :project="current" class="size-4.5 shrink-0 rounded-sm" />
      <UiRenameField :value="current.name" :label="t('settings.projects.name')" class="flex-1" @commit="stopRename" @cancel="stopRename()" />
    </div>
    <UiTooltip v-else :label="t('rail.switchProject')" :shortcut="shortcuts.label('switchProject')" :disabled="open">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          ref="trigger"
          class="group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-selection-hover"
          :aria-label="`${t('rail.switchProject')}, ${current?.name ?? noneLabel}`"
          :aria-keyshortcuts="current ? shortcuts.aria('rename') : undefined"
          @keydown="onTriggerKeydown"
        >
          <ProjectIcon v-if="current" :project="current" class="size-4.5 shrink-0 rounded-sm" />
          <NoProject v-else class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ current?.name ?? noneLabel }}</span>
          <ChevronsUpDown class="ms-auto size-3.5 shrink-0 text-muted" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            side="bottom"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            class="ui-pop z-50 w-(--reka-popover-trigger-width) min-w-64 text-xs text-content select-none"
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
                  ref="filter"
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
                <ListboxItem
                  v-for="item in rows"
                  :key="item.key"
                  :value="item.key"
                  :class="[row, 'pe-1']"
                  @contextmenu.prevent="toggleRowMenu(item.key, true)"
                >
                  <ProjectIcon v-if="item.project" :project="item.project" class="size-4 shrink-0 rounded-sm" />
                  <NoProject v-else class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span
                    v-if="item.project && rowRenaming === item.key"
                    class="flex min-w-0 flex-1"
                    @keydown.capture="rowRenameByKey = $event.key === 'Enter' || $event.key === 'Escape'"
                    @keydown.stop
                    @pointerdown.stop
                    @pointerup.stop
                    @click.stop
                  >
                    <UiRenameField
                      :value="item.project.name"
                      :label="t('settings.projects.name')"
                      class="flex-1"
                      @commit="stopRowRename(item.project, $event)"
                      @cancel="stopRowRename(item.project)"
                    />
                  </span>
                  <span v-else :class="[menuLabel, 'flex-1']">{{ item.project?.name ?? noneLabel }}</span>
                  <!-- Hors du parcours clavier, comme T3 Code : « Réglages rapides », en bas, y mène au clavier. -->
                  <UiTooltip :label="t('rail.quickSettings')" side="right" :side-offset="8" :disabled="rowMenu === item.key">
                    <span class="flex">
                      <DropdownMenuRoot
                        :open="rowMenu === item.key"
                        :modal="false"
                        @update:open="toggleRowMenu(item.key, $event)"
                      >
                        <DropdownMenuTrigger
                          tabindex="-1"
                          aria-hidden="true"
                          class="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-inner hover:text-content aria-expanded:bg-selection-inner aria-expanded:text-content"
                          @pointerdown.stop
                          @pointerup.stop
                          @click.stop
                        >
                          <Settings class="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuContent
                            side="right"
                            align="start"
                            :side-offset="8"
                            :collision-padding="8"
                            :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-52']"
                            @open-auto-focus.prevent
                            @close-auto-focus.prevent
                          >
                            <ProjectMenu v-if="item.project" :project="item.project" @rename="startRowRename(item.key)" />
                            <NoProjectMenu v-else />
                          </DropdownMenuContent>
                        </DropdownMenuPortal>
                      </DropdownMenuRoot>
                    </span>
                  </UiTooltip>
                </ListboxItem>
                <p v-if="!shown.length && !showNone" class="px-2 py-1.5 text-[13px] text-muted">{{ t('projectPicker.none') }}</p>
              </ListboxContent>
            </ListboxRoot>
            <div class="flex flex-col gap-0.5 border-t border-stroke p-1.5">
              <DropdownMenuRoot v-model:open="quickOpen" :modal="false">
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
                    <ProjectMenu v-if="current" :project="current" @rename="startRename" />
                    <NoProjectMenu v-else />
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
    <template #menu>
      <ProjectMenu v-if="current" :project="current" @rename="startRename" />
      <NoProjectMenu v-else />
    </template>
  </UiContextMenu>
</template>
