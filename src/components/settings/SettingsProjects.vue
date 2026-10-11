<script setup lang="ts">
import { FolderPlus, SlidersHorizontal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useAddProject } from '@/composables/useAddProject'
import { useRefocus } from '@/composables/useRefocus'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'

const { t } = useI18n()
const projects = useProjectsStore()
const navigation = useNavigationStore()
const addProject = useAddProject()
const refocusAfter = useRefocus()
</script>

<template>
  <!-- État vide : le bouton de l'en-tête descend ici ; validé au clavier, le focus passe à celui de l'en-tête. -->
  <div v-if="!projects.projects.length" data-setting="projects-list" class="mt-8 flex flex-col items-start gap-3 rounded-xl border border-stroke bg-content/3 px-4 py-5">
    <div>
      <p class="text-sm font-medium">{{ t('settings.projects.empty') }}</p>
      <p class="mt-0.5 text-xs/relaxed text-muted">{{ t('settings.projects.emptyHint') }}</p>
    </div>
    <UiButton variant="primary" data-project-add @click="refocusAfter($event, addProject, '[data-project-add]')">
      <FolderPlus class="size-4" aria-hidden="true" />{{ t('settings.projects.add') }}
    </UiButton>
  </div>

  <ul v-else data-setting="projects-list" class="mt-8 overflow-hidden rounded-xl border border-stroke bg-content/3">
    <li v-for="project in projects.projects" :key="project.id" class="group flex items-center gap-3 border-b border-stroke px-4 py-2 last:border-b-0">
      <ProjectIcon :project="project" class="size-6 shrink-0" />
      <div class="min-w-0 flex-1">
        <!-- Raccourci souris : au clavier, le bouton de réglages de la ligne fait la même chose. -->
        <button
          type="button"
          tabindex="-1"
          class="block max-w-full cursor-pointer truncate text-start text-sm font-medium hover:underline"
          @click="navigation.showSettingsDetail(`project:${project.id}`)"
        >
          {{ project.name }}
        </button>
        <p class="truncate font-mono text-xs text-muted" :title="project.path">{{ project.path }}</p>
      </div>
      <!-- Visible au survol ou quand le clavier entre dans la ligne : la liste reste calme. -->
      <UiIconButton
        class="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
        :label="t('settings.projects.configure', { name: project.name })"
        :data-customize="`project:${project.id}`"
        @click="navigation.showSettingsDetail(`project:${project.id}`)"
      >
        <SlidersHorizontal class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </li>
  </ul>
</template>
