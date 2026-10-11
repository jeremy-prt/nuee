<script setup lang="ts">
import { Check, Copy, FolderOpen, Pencil, Sparkles, X } from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isAppError } from '@/ipc/agent'
import { isMacosApp } from '@/ipc/system'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Skill, useSkillsStore } from '@/stores/skills'

// Panneau de droite des réglages : même place, poignée et largeur que celui des chats (App.vue), même en-tête
// que ShellDock. Il montre le SKILL.md choisi, rendu comme une réponse d'agent, ou l'édite tel quel.
const props = defineProps<{ skill: Skill }>()

const { t } = useI18n()
const store = useSkillsStore()
const shortcuts = useShortcutsStore()
const revealLabel = isMacosApp() ? 'settings.skills.reveal' : 'settings.skills.revealFolder'
const editor = useTemplateRef('editor')
// Le fichier entier, en-tête compris : c'est lui qu'on édite.
const text = ref<string | null>(null)
const failure = ref<string | null>(null)
const saving = ref(false)
const saved = ref(false)
const copied = ref(false)

// L'en-tête YAML (nom, description) est déjà sur la page : l'aperçu montre le reste.
const body = computed(() => text.value?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '') ?? null)

watch(
  () => props.skill.id,
  async (id) => {
    text.value = null
    failure.value = null
    copied.value = false
    saved.value = false
    try {
      const content = await store.read(props.skill)
      if (props.skill.id === id) text.value = content
    } catch (error) {
      if (props.skill.id === id) failure.value = isAppError(error) ? error.message : String(error)
    }
  },
  { immediate: true },
)

// L'éditeur part du fichier lu et prend le focus : « Modifier », c'est pour écrire tout de suite.
watch(
  () => store.editing && text.value !== null,
  async (open) => {
    if (!open) return
    if (!store.dirty) store.draft = text.value ?? ''
    saved.value = false
    await nextTick()
    editor.value?.focus()
  },
  { immediate: true },
)

watch(() => store.draft, (value) => {
  store.dirty = store.editing && text.value !== null && value !== text.value
  if (store.dirty) saved.value = false
})

async function save() {
  if (!store.dirty || saving.value) return
  saving.value = true
  const content = store.draft
  if (await store.save(props.skill, content)) {
    text.value = content
    saved.value = true
  }
  saving.value = false
}

async function copy() {
  if (!(await store.copy(props.skill))) return
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

// Fermé au clavier, le focus revient sur le bouton « Voir » de la ligne ; à la souris, il ne bouge pas.
async function close(event: MouseEvent) {
  const id = props.skill.id
  if (!(await store.confirmClose())) return
  if (event.detail !== 0) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-skill-preview="${CSS.escape(id)}"]`)?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!store.editing || !shortcuts.matches(event, 'saveSkill')) return
  event.preventDefault()
  save()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col bg-chrome" :aria-label="t('settings.skills.panel', { name: skill.name })">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
      <span class="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-selection px-2 text-xs text-content">
        <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ skill.name }}</span>
      </span>
      <span class="flex-1" />
      <UiIconButton v-if="!store.editing" :label="t('settings.skills.editLabel', { name: skill.name })" :disabled="text === null" @click="store.edit(skill)">
        <Pencil class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="copied ? t('settings.skills.copied') : t('settings.skills.copyPath')" @click="copy()">
        <component :is="copied ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied }" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="t(revealLabel)" @click="store.reveal(skill)">
        <FolderOpen class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="t('dock.close')" @click="close($event)">
        <X class="size-4" aria-hidden="true" />
      </UiIconButton>
    </div>

    <template v-if="store.editing && text !== null">
      <textarea
        ref="editor"
        v-model="store.draft"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :aria-label="t('settings.skills.editorLabel', { name: skill.name })"
        class="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-xs/relaxed outline-none select-text"
      />
      <div class="flex shrink-0 items-center gap-2 border-t border-stroke px-3 py-2">
        <p class="min-w-0 flex-1 truncate text-xs" :class="store.dirty ? 'text-muted' : 'text-success'" role="status">
          <template v-if="store.dirty">{{ t('settings.skills.unsaved') }}</template>
          <template v-else-if="saved">{{ t('settings.skills.saved') }}</template>
        </p>
        <UiButton size="sm" variant="ghost" @click="store.confirmClose(true)">{{ t('settings.skills.closeEditor') }}</UiButton>
        <UiButton size="sm" variant="primary" :loading="saving" :disabled="!store.dirty" @click="save()">
          {{ t('settings.skills.save') }}
          <span class="text-canvas/60">{{ shortcuts.label('saveSkill') }}</span>
        </UiButton>
      </div>
    </template>
    <div v-else class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <p class="truncate pb-3 font-mono text-xs text-muted select-text" :title="skill.path">{{ skill.path }}</p>
      <p v-if="failure" class="text-xs text-danger">{{ failure }}</p>
      <p v-else-if="body === null" class="text-xs text-muted" role="status">{{ t('settings.skills.reading') }}</p>
      <ChatMarkdown v-else :text="body" />
    </div>
  </section>
</template>
