<script setup lang="ts">
import { Check, Copy, FolderOpen } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isAppError } from '@/ipc/agent'
import { projectReveal } from '@/ipc/project'
import { isMacosApp } from '@/ipc/system'
import type { Project } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const toasts = useToastsStore()

const revealLabel = isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder'
const copied = ref(false)

async function copyPath() {
  try {
    await navigator.clipboard.writeText(props.project.path)
  } catch {
    return
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function reveal() {
  try {
    await projectReveal(props.project.path)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.revealFailed'), body: isAppError(error) ? error.message : String(error) })
  }
}
</script>

<template>
  <SettingsRow data-setting="project-folder" :label="t('settings.projects.folder')">
    <template #hint><span class="font-mono break-all select-text">{{ project.path }}</span></template>
    <div class="flex items-center gap-1">
      <UiIconButton :label="copied ? t('settings.projects.copied') : t('settings.projects.copyPath')" @click="copyPath">
        <component :is="copied ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied }" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="t(revealLabel)" @click="reveal">
        <FolderOpen class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
  </SettingsRow>
</template>
