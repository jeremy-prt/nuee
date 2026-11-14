<script setup lang="ts">
import { Plus, Search, Trash2 } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { field, fieldText } from '@/components/ui/field'
import { useDebounced } from '@/composables/useDebounced'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { useSlow } from '@/composables/useSlow'
import { useClockStore } from '@/stores/clock'
import { useNotesStore } from '@/stores/notes'
import { useProjectsStore } from '@/stores/projects'
import { formatSince } from '@/utils/duration'
import { notePreview } from '@/utils/notes'
import { normalize } from '@/utils/search'

// Colonne de gauche de la page Notes. `scope` : projet affiché ('' = notes libres) ; une recherche porte sur toutes.
const scope = defineModel<string>('scope', { required: true })
const emit = defineEmits<{ create: [] }>()

const { t, locale } = useI18n()
const notes = useNotesStore()
const projects = useProjectsStore()
const clock = useClockStore()
const query = ref('')
const searched = useDebounced(query)
const slow = useSlow(() => !notes.loaded)

const counts = computed(() => {
  const counts: Record<string, number> = {}
  for (const note of notes.notes) counts[note.projectId ?? ''] = (counts[note.projectId ?? ''] ?? 0) + 1
  return counts
})

const searching = computed(() => !!searched.value.trim())
const listed = computed(() => {
  if (!searching.value) return notes.notes.filter((note) => (note.projectId ?? '') === scope.value)
  const wanted = normalize(searched.value)
  return notes.notes.filter((note) => normalize(`${note.title} ${note.body}`).includes(wanted))
})
const { shown, more, limit, sentinel } = useProgressiveList(listed, () => [scope.value, searched.value])

const projectName = (id: string | null) => projects.byId(id)?.name ?? t('notes.free')
</script>

<template>
  <section class="flex min-h-0 flex-col" :aria-label="t('rail.notes')">
    <div class="flex h-11 shrink-0 items-center gap-1 ps-1.5 pe-2">
      <div class="flex min-w-0">
        <ProjectPicker v-model="scope" :label="t('notes.scope')" :none-label="t('notes.freeNotes')" :counts="counts" />
      </div>
      <UiIconButton class="ms-auto" :label="t('notes.new')" @click="emit('create')">
        <Plus class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>
    <label :class="[field, 'mx-2 mb-2 shrink-0']" data-control>
      <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        :class="fieldText"
        :placeholder="t('notes.search')"
        :aria-label="t('notes.search')"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        @keydown.esc="query = ''"
      />
    </label>

    <UiSkeleton v-if="slow" :label="t('notes.loading')" :rows="6" />
    <div v-else-if="notes.loaded" class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <ul v-if="shown.length" class="flex flex-col gap-0.5">
        <!-- group/row : la ligne garde son survol quand le pointeur passe sur la corbeille, posée par-dessus l'heure. -->
        <li v-for="note in shown" :key="note.id" class="group/row relative">
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            :class="note.id === notes.selectedId ? 'bg-selection' : 'group-hover/row:bg-selection-hover'"
            :aria-current="note.id === notes.selectedId || undefined"
            @click="notes.selectedId = note.id"
          >
            <span class="flex w-full items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-[13px] font-medium" :class="{ 'text-muted': !note.title }">{{ note.title || t('notes.untitled') }}</span>
              <span
                class="shrink-0 text-[11px] text-muted tabular-nums transition-opacity duration-(--hover-duration) group-hover/row:opacity-0 group-focus-within/row:opacity-0 motion-reduce:transition-none"
              >
                {{ formatSince(note.updatedAt, clock.now, locale, true) }}
              </span>
            </span>
            <span v-if="searching" class="truncate text-[11px] text-muted">{{ projectName(note.projectId) }}</span>
            <span v-else class="line-clamp-2 text-xs text-muted">{{ notePreview(note.body) || t('notes.emptyBody') }}</span>
          </button>
          <div
            class="absolute end-1 top-1 opacity-0 transition-opacity duration-(--hover-duration) ease-out group-hover/row:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
          >
            <UiTooltip :label="t('notes.delete.action')">
              <button
                type="button"
                class="grid size-6 place-items-center rounded-sm text-muted hover:bg-danger/15 hover:text-danger focus-visible:outline-2 focus-visible:outline-ring"
                :aria-label="t('notes.delete.label', { title: note.title || t('notes.untitled') })"
                @click="notes.confirmRemove(note.id)"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
          </div>
        </li>
      </ul>
      <div v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
      <p v-if="!shown.length && notes.notes.length" class="px-2 py-1 text-xs text-muted" aria-live="polite">
        {{ searching ? t('notes.noResults') : t('notes.noneHere') }}
      </p>
    </div>
  </section>
</template>
