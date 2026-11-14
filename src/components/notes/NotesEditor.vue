<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import NotesBody from '@/components/notes/NotesBody.vue'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useSkillChat } from '@/composables/useSkillChat'
import type { Note } from '@/ipc/bindings/Note'
import { useClockStore } from '@/stores/clock'
import { useDraftsStore } from '@/stores/drafts'
import { useNavigationStore } from '@/stores/navigation'
import { useNotesStore } from '@/stores/notes'
import { useWorkspaceStore } from '@/stores/workspace'
import { formatSince } from '@/utils/duration'

// Note ouverte : titre, rangement, puis son texte mis en forme. Recréé à chaque note (`:key`).
const props = defineProps<{ note: Note }>()

const { t, locale } = useI18n()
const notes = useNotesStore()
const clock = useClockStore()
const drafts = useDraftsStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const skillChat = useSkillChat()

// Texte tenu ici, pas relu dans le store : un `:value` repassé à chaque rendu ferait perdre les lettres tapées entre deux.
const title = ref(props.note.title)
const text = ref(props.note.body)
watch(title, (value) => notes.update(props.note.id, { title: value }))
watch(text, (value) => notes.update(props.note.id, { body: value }))
const body = useTemplateRef('body')
const titleField = useTemplateRef('titleField')

const project = computed({
  get: () => props.note.projectId ?? '',
  set: (id: string) => notes.update(props.note.id, { projectId: id || null }),
})
const mention = computed(() => (props.note.slug ? `#${props.note.slug}` : null))


// Une note créée à l'instant attend son titre.
if (!props.note.title && !props.note.body) void nextTick(() => titleField.value?.focus())

// Nouvelle session dans le projet de la note, sa mention déjà dans le champ.
function send() {
  if (!mention.value) return
  navigation.openChats(props.note.projectId)
  workspace.showBlank()
  const chatId = workspace.activeTabId
  if (chatId) drafts.requestInsert(chatId, `${mention.value} `)
}

async function toSkill() {
  if (!mention.value) return
  const before = workspace.activeTabId
  await skillChat({ kind: 'createSkill' })
  const chatId = workspace.activeTabId
  if (chatId && chatId !== before) drafts.requestInsert(chatId, t('notes.toSkillPrompt', { mention: mention.value }))
}
</script>

<template>
  <article class="flex min-h-0 flex-col" @focusout="notes.flush(note.id)">
    <div class="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-8 pt-6 pb-3">
      <div class="flex items-center gap-1.5">
        <input
          ref="titleField"
          v-model="title"
          class="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none select-text placeholder:text-muted"
          :placeholder="t('notes.untitled')"
          :aria-label="t('notes.title')"
          maxlength="200"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          @keydown.enter.prevent="body?.focus()"
        />
        <ChatCopyButton :text="() => text" :label="t('notes.copy')" />
        <UiMoreMenu :label="t('notes.more')">
          <UiMenuItem :label="t('notes.toSkill')" :disabled="!mention" @select="toSkill" />
          <UiMenuItem :label="t('notes.delete.action')" danger @select="notes.confirmRemove(note.id)" />
        </UiMoreMenu>
        <!-- Infobulle seulement grisé : elle dit pourquoi. -->
        <UiTooltip v-if="!mention" :label="t('notes.needsTitle')" side="bottom">
          <span class="ms-1 flex">
            <UiButton size="sm" variant="primary" disabled>{{ t('notes.send') }}</UiButton>
          </span>
        </UiTooltip>
        <UiButton v-else class="ms-1" size="sm" variant="primary" @click="send">{{ t('notes.send') }}</UiButton>
      </div>
      <div class="flex h-7 min-w-0 items-center gap-2 text-xs text-muted">
        <div class="-ms-2 flex max-w-56 shrink-0">
          <ProjectPicker v-model="project" badge :label="t('notes.project')" :none-label="t('notes.free')" />
        </div>
        <span class="shrink-0">{{ t('notes.updated', { since: formatSince(note.updatedAt, clock.now, locale) }) }}</span>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <NotesBody ref="body" class="mx-auto w-full max-w-3xl px-8" :text="note.body" @change="text = $event" />
    </div>
  </article>
</template>
