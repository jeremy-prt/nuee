<script setup lang="ts">
import { computed, watch } from 'vue'
import ProjectMascot from '@/components/project/ProjectMascot.vue'
import { type Project, useProjectsStore } from '@/stores/projects'

const props = defineProps<{ project: Project }>()
const projects = useProjectsStore()

watch(() => props.project.id, () => projects.loadIcon(props.project), { immediate: true })

// Rien tant que le dossier n'est pas lu, plutôt qu'une mascotte remplacée aussitôt par l'icône.
const shown = computed(() => projects.shown(props.project))
</script>

<template>
  <img v-if="shown && 'image' in shown" :src="shown.image" alt="" draggable="false" class="object-contain" />
  <ProjectMascot v-else-if="shown" :mascot="shown.mascot" :color="project.color" />
  <span v-else aria-hidden="true" />
</template>
