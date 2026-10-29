<script setup lang="ts">
import { ChevronDown, Plus, Search } from '@/components/ui/icons'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatIcon from '@/components/chat/ChatIcon.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import ProjectMenu from '@/components/project/ProjectMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuLabel, menuRow } from '@/components/ui/menuRow'
import { useAddProject } from '@/composables/useAddProject'
import { useProjectActions } from '@/composables/useProjectActions'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { normalize } from '@/utils/search'

// En haut à gauche de « Projets en menu » : le projet en cours, et la liste pour passer à un autre ou au Chat.
// Clic droit : le menu du projet, comme sur sa ligne dans « Projets en colonne ».
const { t } = useI18n()
const navigation = useNavigationStore()
const projects = useProjectsStore()
const actions = useProjectActions()
const shortcuts = useShortcutsStore()
const pickProject = useAddProject()
const open = toRef(navigation, 'switcherOpen')
const query = ref('')

const current = computed(() => projects.byId(navigation.projectId))
const chatLabel = computed(() => t('rail.chats'))
const shown = computed(() => {
  const needle = normalize(query.value)
  return needle ? projects.ordered.filter((project) => normalize(project.name).includes(needle)) : projects.ordered
})
const showChat = computed(() => !query.value.trim() || normalize(chatLabel.value).includes(normalize(query.value)))

watch(open, (value) => {
  if (!value) query.value = ''
})

// Listbox en valeurs texte : '' vaut le Chat sans projet. Rechoisir le projet en cours ramène à ses sessions.
function choose(value: unknown) {
  if (typeof value === 'string') navigation.openChats(value || null)
  open.value = false
}

async function addProject() {
  open.value = false
  const project = await pickProject()
  if (project) navigation.openChats(project.id)
}

const row = [menuRow, 'items-center py-1.5']
</script>

<template>
  <UiContextMenu :disabled="!current">
    <UiTooltip :label="t('rail.switchProject')" :shortcut="shortcuts.label('switchProject')" :disabled="open">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger
          class="group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-selection-hover"
          :aria-label="`${t('rail.switchProject')}, ${current?.name ?? chatLabel}`"
        >
          <ProjectIcon v-if="current" :project="current" class="size-4 shrink-0 rounded-sm" />
          <ChatIcon v-else many class="size-4 shrink-0 text-muted" />
          <span class="min-w-0 truncate">{{ current?.name ?? chatLabel }}</span>
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
              <ListboxContent class="flex max-h-80 flex-col gap-px overflow-y-auto p-1.5">
                <ListboxItem v-if="showChat" value="" :class="row">
                  <ChatIcon many class="size-4 shrink-0 text-muted" />
                  <span :class="menuLabel">{{ chatLabel }}</span>
                </ListboxItem>
                <div v-if="showChat && shown.length" class="mx-2 my-1 h-px shrink-0 bg-stroke" role="separator" />
                <ListboxItem v-for="project in shown" :key="project.id" :value="project.id" :class="row">
                  <ProjectIcon :project="project" class="size-4 shrink-0 rounded-sm" />
                  <span :class="menuLabel">{{ project.name }}</span>
                </ListboxItem>
                <p v-if="!shown.length && !showChat" class="px-2 py-1.5 text-[13px] text-muted">{{ t('projectPicker.none') }}</p>
              </ListboxContent>
            </ListboxRoot>
            <div class="border-t border-stroke p-1.5">
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
