<script setup lang="ts">
import { Pencil, Trash2 } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import ProjectBackgroundMenu from '@/components/project/ProjectBackgroundMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { type ProjectGroup, useProjectsStore } from '@/stores/projects'

// Contenu du menu d'un groupe de projets : clic droit sur son en-tête et bouton « … ».
const props = defineProps<{ group: ProjectGroup }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const projects = useProjectsStore()
</script>

<template>
  <ProjectBackgroundMenu v-model="props.group.background" />
  <UiMenuSeparator />
  <UiMenuItem :label="t('menu.rename')" :icon="Pencil" @select="emit('rename')" />
  <UiMenuItem :label="t('groups.delete')" :icon="Trash2" danger @select="projects.removeGroup(group.id)" />
</template>
