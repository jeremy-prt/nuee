<script setup lang="ts">
import { Check, Copy, FolderOpen, Sparkles, X } from '@lucide/vue'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isMacosApp } from '@/ipc/system'
import { type Skill, useSkillsStore } from '@/stores/skills'

// Panneau de droite des réglages : même place, poignée et largeur que celui des chats (App.vue), même en-tête
// que ShellDock. Il montre le SKILL.md choisi, rendu comme une réponse d'agent.
const props = defineProps<{ skill: Skill }>()

const { t } = useI18n()
const store = useSkillsStore()
const revealLabel = isMacosApp() ? 'settings.skills.reveal' : 'settings.skills.revealFolder'
const text = ref<string | null>(null)
const copied = ref(false)

watch(
  () => props.skill,
  async (skill) => {
    text.value = null
    copied.value = false
    const content = await store.read(skill)
    if (props.skill.id === skill.id) text.value = content
  },
  { immediate: true },
)

async function copy() {
  if (!(await store.copy(props.skill))) return
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

// Fermé au clavier, le focus revient sur le bouton « Voir » de la ligne ; à la souris, il ne bouge pas.
async function close(event: MouseEvent) {
  const id = props.skill.id
  store.preview(null)
  if (event.detail !== 0) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-skill-preview="${CSS.escape(id)}"]`)?.focus()
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col bg-chrome" :aria-label="t('settings.skills.panel', { name: skill.name })">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
      <span class="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-selection px-2 text-xs text-content">
        <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ skill.name }}</span>
      </span>
      <span class="flex-1" />
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
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <p class="truncate pb-3 font-mono text-xs text-muted select-text" :title="skill.path">{{ skill.path }}</p>
      <p v-if="text === null" class="text-xs text-muted" role="status">{{ t('settings.skills.reading') }}</p>
      <ChatMarkdown v-else :text="text" />
    </div>
  </section>
</template>
