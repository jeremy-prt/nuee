<script setup lang="ts">
import { Copy, MessageSquarePlus, Sparkles, Trash2 } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import { useNoteActions } from '@/composables/useNoteActions'
import type { Note } from '@/ipc/bindings/Note'
import { useNotesStore } from '@/stores/notes'

// Menu d'une note, au clic droit dans la liste et dans le « … » de la note ouverte. `inEditor` : la note ouverte a déjà
// ses boutons Copier et Utiliser dans une session à côté du « … », le menu ne les répète pas.
const props = defineProps<{ note: Note; inEditor?: boolean }>()

const { t } = useI18n()
const notes = useNotesStore()
const actions = useNoteActions()
</script>

<template>
  <template v-if="!inEditor">
    <UiMenuItem :label="t('notes.send')" :icon="MessageSquarePlus" :disabled="!props.note.slug" @select="actions.send(props.note)" />
    <UiMenuItem :label="t('notes.copy')" :icon="Copy" @select="actions.copy(props.note)" />
  </template>
  <UiMenuItem :label="t('notes.toSkill')" :icon="Sparkles" :disabled="!props.note.slug" @select="actions.toSkill(props.note)" />
  <UiMenuItem :label="t('notes.delete.action')" :icon="Trash2" danger @select="notes.confirmRemove(props.note.id)" />
</template>
