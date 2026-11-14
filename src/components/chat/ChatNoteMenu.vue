<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSuggest from '@/components/chat/ChatSuggest.vue'
import { useNotesStore } from '@/stores/notes'
import { useProjectsStore } from '@/stores/projects'
import { normalize } from '@/utils/search'

const LIMIT = 20

// Menu « # » du champ de saisie : les notes à redonner à l'agent. `query` : ce qui suit le « # », null hors de lui.
const props = defineProps<{ id: string; query: string | null }>()
const emit = defineEmits<{ choose: [slug: string] }>()

const { t } = useI18n()
const notes = useNotesStore()
const projects = useProjectsStore()
const suggest = useTemplateRef('suggest')

watch(
  () => props.query !== null,
  (opened) => opened && notes.ensure(),
)

// Titre qui commence par la saisie, puis titre ou slug qui la contient ; à égalité, la plus récente.
const items = computed(() => {
  if (props.query === null) return []
  const wanted = normalize(props.query)
  const scored = notes.notes.flatMap((note) => {
    if (!note.slug) return []
    const title = normalize(note.title)
    const score = title.startsWith(wanted) ? 0 : title.includes(wanted) || note.slug.includes(wanted) ? 1 : null
    return score === null ? [] : [{ note, score }]
  })
  scored.sort((a, b) => a.score - b.score || b.note.updatedAt - a.note.updatedAt)
  return scored.slice(0, LIMIT).map(({ note }) => ({
    key: note.slug!,
    label: note.title,
    hint: projects.byId(note.projectId)?.name ?? t('notes.free'),
    tone: 'text-note',
  }))
})

defineExpose({
  open: computed(() => suggest.value?.open ?? false),
  activeId: computed(() => suggest.value?.activeId),
  keydown: (event: KeyboardEvent) => suggest.value?.keydown(event) ?? false,
})
</script>

<template>
  <ChatSuggest :id="id" ref="suggest" :label="t('composer.notes')" :query="query" :items="items" :empty="notes.loaded ? t('composer.noNotes') : undefined" @choose="emit('choose', $event)" />
</template>
