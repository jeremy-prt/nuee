<script setup lang="ts">
import {
  ArrowLeft,
  CircleDot,
  FolderPlus,
  Gauge,
  GitPullRequest,
  House,
  NoProject,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from '@/components/ui/icons'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import ShellChatList from '@/components/shell/ShellChatList.vue'
import ShellProjectGroup from '@/components/shell/ShellProjectGroup.vue'
import ShellProjectItem from '@/components/shell/ShellProjectItem.vue'
import ShellProjectSwitcher from '@/components/shell/ShellProjectSwitcher.vue'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useAddProject } from '@/composables/useAddProject'
import { useNewChat } from '@/composables/useNewChat'
import { useAppearanceStore } from '@/stores/appearance'
import { RAIL_COLLAPSED_WIDTH, useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useUpdatesStore } from '@/stores/updates'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const updates = useUpdatesStore()
const pickProject = useAddProject()
const newChat = useNewChat()
const appearance = useAppearanceStore()

// « Projets en menu » : un projet à la fois, choisi en haut, ses sessions dessous. Repliée, la barre disparaît.
const menu = computed(() => appearance.layout === 'menu')
// Collée à la carte du centre, la barre a déjà 6 px de marge à droite (App.vue) : elle n'en ajoute que 2 de son côté.
const edge = computed(() => (menu.value || !(navigation.hasPanel && layout.panel.open) ? 'pe-0.5' : 'pe-2'))
// Glissé seulement à un vrai changement de projet : au lancement, une fenêtre en arrière-plan figerait
// l'animation sur sa première image, la liste resterait invisible.
const sliding = ref(false)
watch(
  () => navigation.projectId,
  () => (sliding.value = true),
)

const footerButtons = useTemplateRef<HTMLButtonElement[]>('footerButtons')

// Le focus ne suit que si on a validé au clavier le bouton qui disparaît (Réglages, Retour) :
// un clic, Échap ou un raccourci le laissent où il est. `detail` vaut 0 pour un clic venu du clavier.
const byKeyboard = ref(false)

watch(
  () => navigation.view,
  async (_, previous) => {
    const restore = byKeyboard.value
    await nextTick()
    byKeyboard.value = false
    if (restore && previous === 'settings') footerButtons.value?.find((button) => button.dataset.view === 'settings')?.focus()
  },
)

function openFooter(open: () => void, event: MouseEvent) {
  byKeyboard.value = event.detail === 0
  open()
}

function closeSettings(event: MouseEvent) {
  byKeyboard.value = event.detail === 0
  navigation.closeSettings()
}

async function addProject() {
  const project = await pickProject()
  if (project) navigation.openChats(project.id)
}

const pages = [
  { view: 'home', icon: House },
  { view: 'issues', icon: CircleDot },
  { view: 'pullRequests', icon: GitPullRequest },
  { view: 'notes', icon: NotebookPen },
  { view: 'search', icon: Search, shortcut: 'search' },
] as const

const menuPages = pages.filter((page) => page.view !== 'search')

// Mises à jour n'est pas une vue : le bouton mène à Réglages > Général.
const footer = [
  { id: 'settings', icon: Settings, shortcut: 'settings', open: () => navigation.go('settings') },
  { id: 'usage', icon: Gauge, open: () => navigation.go('usage') },
  { id: 'updates', icon: RefreshCw, open: () => navigation.openSettings('general') },
] as const

function footerLabel(id: (typeof footer)[number]['id']) {
  return id === 'updates' && updates.status === 'available' ? t('updates.availableTitle') : t(`rail.${id}`)
}
</script>

<template>
  <aside
    id="shell-rail"
    class="flex shrink-0 flex-col overflow-hidden bg-frame"
    :style="{ width: `${layout.rail.expanded ? layout.rail.width : RAIL_COLLAPSED_WIDTH}px` }"
  >
    <template v-if="menu && navigation.view !== 'settings'">
      <!-- La recherche passe en icône à droite du projet, comme la loupe de monocode. -->
      <div class="flex shrink-0 items-center gap-1 ps-2 pe-0.5 pt-1 pb-2">
        <!-- Le sélecteur s'ajuste à son nom, comme monocode : un fond pleine largeur avec la flèche collée au nom faisait bancal. -->
        <div class="flex min-w-0 flex-1 *:min-w-0"><ShellProjectSwitcher /></div>
        <UiIconButton
          :label="t('rail.search')"
          :shortcut="shortcuts.label('search')"
          :active="navigation.view === 'search'"
          @click="navigation.go('search')"
        >
          <Search class="size-4" aria-hidden="true" />
        </UiIconButton>
      </div>
      <nav class="flex shrink-0 flex-col gap-0.5 ps-2 pe-0.5" :aria-label="t('rail.label')">
        <ShellRailItem
          v-for="item in menuPages"
          :key="item.view"
          :icon="item.icon"
          :label="t(`rail.${item.view}`)"
          expanded
          :active="navigation.view === item.view"
          @click="navigation.go(item.view)"
        />
      </nav>
      <section class="mt-3 flex min-h-0 flex-1 flex-col" aria-labelledby="sidebar-sessions">
        <div class="flex h-8 shrink-0 items-center ps-4 pe-0.5">
          <h2 id="sidebar-sessions" class="min-w-0 flex-1 truncate text-xs font-medium text-muted">{{ t('chats.recent') }}</h2>
          <UiIconButton :label="t('chats.newChat')" :shortcut="shortcuts.label('newChat')" @click="newChat()">
            <Plus class="size-4" aria-hidden="true" />
          </UiIconButton>
        </div>
        <div
          :key="navigation.projectId ?? ''"
          class="min-h-0 flex-1 overflow-y-auto ps-2 pe-0.5 pb-2"
          :class="{ 'project-slide': sliding }"
          :data-step="navigation.projectStep"
        >
          <ShellChatList titled />
        </div>
      </section>
    </template>
    <nav
      v-else
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto py-2 ps-2"
      :class="edge"
      :aria-label="navigation.view === 'settings' ? t('settings.nav') : t('rail.label')"
    >
      <SettingsNav v-if="navigation.view === 'settings'" :focus-current="byKeyboard" />
      <template v-else>
        <ShellRailItem
          v-for="item in pages"
          :key="item.view"
          :icon="item.icon"
          :label="t(`rail.${item.view}`)"
          :shortcut="'shortcut' in item ? shortcuts.label(item.shortcut) : undefined"
          :expanded="layout.rail.expanded"
          :active="navigation.view === item.view"
          @click="navigation.go(item.view)"
        />

        <div class="my-3 h-px shrink-0 bg-stroke" />
        <ShellRailItem
          :label="t('rail.chats')"
          :expanded="layout.rail.expanded"
          :active="navigation.view === 'chats' && navigation.projectId === null"
          @click="navigation.openChats(null)"
        >
          <template #icon><NoProject class="size-4 shrink-0" aria-hidden="true" /></template>
        </ShellRailItem>

        <template v-if="projects.pinned.length">
          <div data-pinned-heading class="mt-3 flex h-8 shrink-0 items-center ps-2">
            <p v-if="layout.rail.expanded" class="min-w-0 flex-1 truncate text-xs font-medium whitespace-nowrap text-muted">
              {{ t('rail.pinned') }}
            </p>
          </div>
          <ShellProjectItem v-for="project in projects.pinned" :key="project.id" :project="project" />
        </template>

        <!-- Section à part, comme monocode : un groupe ne contient que des projets. Repliée, la barre n'a pas la
             place des groupes : leurs projets passent à la suite dans Projets. -->
        <template v-if="layout.rail.expanded && projects.groups.length">
          <div class="mt-3 flex h-8 shrink-0 items-center ps-2">
            <p class="min-w-0 flex-1 truncate text-xs font-medium whitespace-nowrap text-muted">{{ t('rail.groups') }}</p>
            <UiTooltip :label="t('groups.create')" side="top" :side-offset="8">
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                :aria-label="t('groups.create')"
                @click="projects.createGroup()"
              >
                <FolderPlus class="size-4" aria-hidden="true" />
              </button>
            </UiTooltip>
          </div>
          <ShellProjectGroup v-for="group in projects.groups" :key="group.id" :group="group" />
        </template>

        <!-- Même hauteur dans les deux états : les projets en dessous ne bougent pas au repli. -->
        <div data-projects-heading class="mt-3 flex h-8 shrink-0 items-center" :class="{ 'ps-2': layout.rail.expanded }">
          <p v-if="layout.rail.expanded" class="min-w-0 flex-1 truncate text-xs font-medium whitespace-nowrap text-muted">
            {{ t('rail.projects') }}
          </p>
          <!-- Tant qu'aucun groupe n'existe, sa section n'a pas d'en-tête : le bouton de création est ici. -->
          <UiTooltip v-if="layout.rail.expanded && !projects.groups.length" :label="t('groups.create')" side="top" :side-offset="8">
            <button
              type="button"
              class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              :aria-label="t('groups.create')"
              @click="projects.createGroup()"
            >
              <FolderPlus class="size-4" aria-hidden="true" />
            </button>
          </UiTooltip>
          <UiTooltip :label="t('rail.addProject')" :side="layout.rail.expanded ? 'top' : 'right'" :side-offset="8">
            <button
              type="button"
              class="grid shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              :class="layout.rail.expanded ? 'size-7' : 'size-8'"
              :aria-label="t('rail.addProject')"
              @click="addProject()"
            >
              <Plus class="size-4" aria-hidden="true" />
            </button>
          </UiTooltip>
        </div>
        <template v-if="!layout.rail.expanded">
          <template v-for="group in projects.groups" :key="group.id">
            <ShellProjectItem v-for="project in projects.projectsIn(group.id)" :key="project.id" :project="project" />
          </template>
        </template>
        <ShellProjectItem v-for="project in projects.ungrouped" :key="project.id" :project="project" />
      </template>
    </nav>

    <div v-if="navigation.view === 'settings'" class="shrink-0 py-2 ps-2" :class="edge">
      <ShellRailItem
        :icon="ArrowLeft"
        :label="t('settings.back')"
        :expanded="layout.rail.expanded"
        @click="closeSettings($event)"
      />
    </div>
    <!-- Dépliée : une ligne (Réglages et Quota à gauche, Mises à jour à droite). Repliée : une colonne de 48 px. -->
    <div
      v-else
      class="flex shrink-0 gap-0.5 py-2 ps-2"
      :class="[layout.rail.expanded ? 'flex-row' : 'flex-col', edge]"
    >
      <template v-for="(item, index) in footer" :key="item.id">
        <span v-if="layout.rail.expanded && index === footer.length - 1" class="flex-1" />
        <UiTooltip
          :label="footerLabel(item.id)"
          :shortcut="'shortcut' in item ? shortcuts.label(item.shortcut) : undefined"
          :side="layout.rail.expanded ? 'top' : 'right'"
          :side-offset="8"
        >
          <button
            ref="footerButtons"
            type="button"
            :data-view="item.id"
            class="relative grid size-8 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            :class="navigation.view === item.id ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
            :aria-label="footerLabel(item.id)"
            :aria-current="navigation.view === item.id ? 'page' : undefined"
            @click="openFooter(item.open, $event)"
          >
            <component :is="item.icon" class="size-4" aria-hidden="true" />
            <span
              v-if="item.id === 'updates' && updates.status === 'available'"
              class="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-signal"
              aria-hidden="true"
            />
          </button>
        </UiTooltip>
      </template>
    </div>
  </aside>
</template>
