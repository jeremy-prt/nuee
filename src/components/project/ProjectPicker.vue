<script setup lang="ts">
import { Check, ChevronDown, Search } from '@lucide/vue'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatIcon from '@/components/chat/ChatIcon.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import { useProjectsStore } from '@/stores/projects'
import { normalize } from '@/utils/search'

// Titre cliquable qui ouvre la liste des projets. `noneLabel` ajoute en tête le choix « sans projet » (valeur '').
// counts : nombre affiché à droite de chaque choix, clé '' pour « sans projet ». large : titre de page.
const props = defineProps<{ label: string; noneLabel?: string; counts?: Record<string, number>; large?: boolean }>()
const model = defineModel<string>({ required: true })

const { t } = useI18n()
const projects = useProjectsStore()
const open = ref(false)
const query = ref('')

const current = computed(() => projects.byId(model.value || null))
const shown = computed(() => {
  const needle = normalize(query.value)
  return needle ? projects.projects.filter((project) => normalize(project.name).includes(needle)) : projects.projects
})
const showNone = computed(() => props.noneLabel !== undefined && (!query.value.trim() || normalize(props.noneLabel).includes(normalize(query.value))))

watch(open, (value) => {
  if (!value) query.value = ''
})

// En mode « toggle », reka désélectionne le choix déjà fait : on le garde et on ferme.
function choose(value: unknown) {
  if (typeof value === 'string') model.value = value
  open.value = false
}

const item =
  'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-content/80 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=checked]:text-content'
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      class="group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md ps-2 pe-1.5 font-semibold hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-selection"
      :class="large ? 'h-9 text-xl' : 'h-8 text-[15px]'"
    >
      <ProjectIcon v-if="current" :project="current" class="shrink-0 rounded-sm" :class="large ? 'size-6' : 'size-4.5'" />
      <ChatIcon v-else many class="size-4 shrink-0 text-muted" />
      <span class="sr-only">{{ label }}</span>
      <span class="truncate">{{ current?.name ?? noneLabel }}</span>
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
        class="ui-pop z-50 w-64 text-[13px] text-content select-none"
        :style="{ transformOrigin: 'var(--reka-popover-content-transform-origin)' }"
      >
        <ListboxRoot :model-value="model" highlight-on-hover :aria-label="label" @update:model-value="choose">
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
              class="min-w-0 flex-1 bg-transparent outline-none select-text placeholder:text-muted"
            />
          </div>
          <ListboxContent class="max-h-80 overflow-y-auto p-1">
            <ListboxItem v-if="showNone" value="" :class="item">
              <span class="grid size-3.5 shrink-0 place-items-center"><Check v-if="!model" class="size-3.5" aria-hidden="true" /></span>
              <ChatIcon many class="size-4 shrink-0 text-muted" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ noneLabel }}</span>
              <span v-if="counts" class="shrink-0 text-xs text-muted tabular-nums">{{ counts[''] ?? 0 }}</span>
            </ListboxItem>
            <div v-if="showNone && shown.length" class="mx-2 my-1 border-t border-stroke" role="separator" />
            <p v-if="!shown.length && !showNone" class="px-2 py-1.5 text-muted">{{ t('projectPicker.none') }}</p>
            <ListboxItem v-for="project in shown" :key="project.id" :value="project.id" :class="item">
              <span class="grid size-3.5 shrink-0 place-items-center"><Check v-if="project.id === model" class="size-3.5" aria-hidden="true" /></span>
              <ProjectIcon :project="project" class="size-4 shrink-0 rounded-sm" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ project.name }}</span>
              <span v-if="counts" class="shrink-0 text-xs text-muted tabular-nums">{{ counts[project.id] ?? 0 }}</span>
            </ListboxItem>
          </ListboxContent>
        </ListboxRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
