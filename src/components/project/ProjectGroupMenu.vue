<script setup lang="ts">
import { Pencil, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import { type ProjectGroup, useProjectsStore } from '@/stores/projects'

// Contenu du menu d'un groupe de projets : clic droit sur son en-tête et bouton « … ».
defineProps<{ group: ProjectGroup }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const projects = useProjectsStore()
</script>

<template>
  <UiMenuItem :label="t('menu.rename')" :icon="Pencil" @select="emit('rename')" />
  <UiMenuItem :label="t('groups.delete')" :icon="Trash2" danger @select="projects.removeGroup(group.id)" />
</template>
