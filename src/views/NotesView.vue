<script setup lang="ts">
import { NotebookPen } from '@/components/ui/icons'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NotesEditor from '@/components/notes/NotesEditor.vue'
import NotesList from '@/components/notes/NotesList.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useNavigationStore } from '@/stores/navigation'
import { useNotesStore } from '@/stores/notes'

const { t } = useI18n()
const notes = useNotesStore()
const navigation = useNavigationStore()

// ===== Initialisation =====
notes.ensure()
// La note ouverte décide du projet affiché ; sinon celui de l'app ('' = notes libres).
const scope = ref(notes.byId(notes.selectedId)?.projectId ?? navigation.projectId ?? '')
const selected = computed(() => notes.byId(notes.selectedId))

// Une note déplacée dans un autre projet reste ouverte : la liste la suit.
watch(
  () => selected.value?.projectId,
  (projectId) => {
    if (selected.value) scope.value = projectId ?? ''
  },
)

// Changer de note écrit aussitôt ce que l'ancienne attendait.
watch(
  () => notes.selectedId,
  (_, before) => before && notes.flush(before),
)

async function create() {
  const note = await notes.create({ projectId: scope.value || null })
  notes.selectedId = note.id
}
</script>

<template>
  <div class="flex h-full min-h-0">
    <NotesList v-model:scope="scope" class="w-72 shrink-0 border-e border-stroke" @create="create" />
    <NotesEditor v-if="selected" :key="selected.id" :note="selected" class="page-in min-w-0 flex-1" />
    <UiEmpty
      v-else-if="notes.loaded"
      :icon="NotebookPen"
      :title="notes.notes.length ? t('notes.pick') : t('notes.emptyTitle')"
      :description="notes.notes.length ? undefined : t('notes.emptyHint')"
    >
      <UiButton size="sm" variant="secondary" @click="create">{{ t('notes.new') }}</UiButton>
    </UiEmpty>
  </div>
</template>
