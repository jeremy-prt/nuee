<script setup lang="ts">
import { SlidersHorizontal } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsProjectDefaults from '@/components/settings/SettingsProjectDefaults.vue'
import SettingsProjectFolder from '@/components/settings/SettingsProjectFolder.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useAddProject } from '@/composables/useAddProject'
import { useRefocus } from '@/composables/useRefocus'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'

const { t } = useI18n()
const projects = useProjectsStore()
const navigation = useNavigationStore()
const addProject = useAddProject()
const refocusAfter = useRefocus()

// Le dernier projet ouvert ici, sinon celui de la barre latérale, sinon le premier.
const selected = computed({
  get: () =>
    projects.byId(navigation.settingsProjectId)?.id ?? projects.byId(navigation.projectId)?.id ?? projects.projects[0]?.id ?? '',
  set: (id: string) => (navigation.settingsProjectId = id),
})
const project = computed(() => projects.byId(selected.value || null))
</script>

<template>
  <!-- État vide : le bouton de l'en-tête descend ici ; validé au clavier, le focus passe à celui de l'en-tête. -->
  <div v-if="!projects.projects.length" data-setting="projects-list" class="mt-8 flex flex-col items-start gap-3 rounded-xl border border-stroke bg-content/3 px-4 py-5">
    <div>
      <p class="text-sm font-medium">{{ t('settings.projects.empty') }}</p>
      <p class="mt-0.5 text-xs/relaxed text-muted">{{ t('settings.projects.emptyHint') }}</p>
    </div>
    <UiButton variant="primary" data-project-add @click="refocusAfter($event, addProject, '[data-project-add]')">
      <Plus class="size-4" aria-hidden="true" />{{ t('settings.projects.add') }}
    </UiButton>
  </div>

  <template v-else-if="project">
    <div data-setting="projects-list" class="flex min-w-0 items-center gap-3 pt-8">
      <ProjectPicker v-model="selected" :label="t('settings.projects.pick')" />
      <UiButton
        size="sm"
        class="ms-auto"
        :data-customize="`project:${project.id}`"
        @click="navigation.showSettingsDetail(`project:${project.id}`)"
      >
        <SlidersHorizontal class="size-3.5" aria-hidden="true" />{{ t('settings.projects.allSettings') }}
      </UiButton>
    </div>
    <SettingsGroup>
      <SettingsProjectFolder :project="project" />
    </SettingsGroup>
    <SettingsProjectDefaults :id="project.id" />
  </template>
</template>
