<script setup lang="ts">
import { watch } from 'vue'
import WorkspacePane from '@/components/workspace/WorkspacePane.vue'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceStore } from '@/stores/workspace'

const workspace = useWorkspaceStore()
const navigation = useNavigationStore()

// Dernier onglet fermé : pas d'écran vide, on revient au « Nouvel espace de travail » (choix de Jérémy).
watch(
  () => workspace.panes.length,
  (count) => {
    if (!count) navigation.go('new')
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-full min-h-0">
    <template v-for="(_, index) in workspace.panes" :key="index">
      <div v-if="index > 0" class="w-px shrink-0 bg-stroke" />
      <WorkspacePane :index="index" />
    </template>
  </div>
</template>
