<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatPane from '@/components/chat/ChatPane.vue'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useNavigationStore } from '@/stores/navigation'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Comme l'écran de Paseo : la session vierge du contexte, avec le choix du projet. Le premier message ouvre la
// session dans son projet.
const { t } = useI18n()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()

const tab = ref<Tab | null>(null)
const pane = useTemplateRef('pane')

const context = computed({
  get: () => navigation.projectId ?? '',
  set: (id: string) => (navigation.projectId = id || null),
})

watch(
  () => navigation.projectId,
  async () => {
    tab.value = workspace.blankChat()
    await nextTick()
    pane.value?.focus()
  },
  { immediate: true },
)

// Après le rendu : le champ doit d'abord vider son brouillon, sinon la session rouvre avec le message envoyé.
watch(
  () => tab.value?.started,
  (started) => {
    if (!started || !tab.value) return
    workspace.show(tab.value.id)
    navigation.go('chats')
  },
  { flush: 'post' },
)
</script>

<template>
  <ChatPane v-if="tab" ref="pane" :key="tab.id" :tab="tab" class="h-full">
    <template #title>
      <h1 class="px-1 text-2xl font-semibold tracking-tight">{{ t('rail.new') }}</h1>
    </template>
    <template #project>
      <UiTooltip :label="t('composer.project')">
        <span class="flex min-w-0">
          <ProjectPicker v-model="context" badge :label="t('rail.switchProject')" :none-label="t('rail.chats')" />
        </span>
      </UiTooltip>
    </template>
  </ChatPane>
</template>
