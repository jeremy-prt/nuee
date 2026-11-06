<script setup lang="ts">
import { computed, watch } from 'vue'
import ProjectLetter from '@/components/project/ProjectLetter.vue'
import { type Project, useProjectsStore } from '@/stores/projects'

const props = defineProps<{ project: Project }>()
const projects = useProjectsStore()

watch(() => props.project.id, () => projects.loadIcon(props.project), { immediate: true })

// Rien tant que le dossier n'est pas lu, plutôt qu'une initiale remplacée aussitôt par l'icône.
const shown = computed(() => projects.shown(props.project))
</script>

<template>
  <ProjectLetter v-if="shown === 'letter'" :name="project.name" :color="project.color" />
  <img v-else-if="shown" :src="shown.image" alt="" draggable="false" class="object-contain" />
  <span v-else aria-hidden="true" />
</template>
