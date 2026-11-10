<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { type IconTheme, loadIconTheme } from '@/utils/materialIcons'

// Icône d'un fichier ou d'un dossier de l'arborescence, thème Material comme monocode. Un carré vide de même taille
// tient la place le temps du chargement : rien ne bouge à son arrivée.
const props = defineProps<{ name: string; folder?: boolean; open?: boolean; root?: boolean }>()

const theme = shallowRef<IconTheme | null>(null)
loadIconTheme().then((loaded) => (theme.value = loaded))

const src = computed(() => {
  const icons = theme.value
  if (!icons) return null
  return props.folder ? icons.folder(props.name, !!props.open, props.root) : icons.file(props.name)
})
</script>

<template>
  <img v-if="src" :src="src" alt="" draggable="false" class="size-4 shrink-0" />
  <span v-else class="inline-block size-4 shrink-0" aria-hidden="true" />
</template>
