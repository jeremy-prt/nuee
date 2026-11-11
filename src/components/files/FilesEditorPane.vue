<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesIcon from '@/components/files/FilesIcon.vue'
import FilesMenu from '@/components/files/FilesMenu.vue'
import FilesViewer from '@/components/files/FilesViewer.vue'
import ShellEditorTabs from '@/components/shell/ShellEditorTabs.vue'
import type { FilesPlace } from '@/ipc/bindings/FilesPlace'
import { useFilesStore } from '@/stores/files'
import { useLayoutStore } from '@/stores/layout'

// Fichiers ouverts depuis l'explorateur, en onglets comme monocode : l'onglet d'aperçu (en italique) est remplacé au
// prochain clic, un double clic ou une modification le garde. Fermer le dernier rend sa place à l'explorateur.
const props = defineProps<{ place: FilesPlace; root: string }>()

const { t } = useI18n()
const store = useFilesStore()
const layout = useLayoutStore()
const browse = computed(() => store.of(props.place.chatId))
const nameOf = (file: string) => file.slice(file.lastIndexOf('/') + 1)
const items = computed(() => browse.value.tabs.map((file) => ({ key: file, name: nameOf(file), title: file })))
// Sous les onglets, la ligne d'outils du fichier tient celle de l'arborescence.
const inBar = computed(() => layout.spans('files'))
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <ShellEditorTabs
      :items="items"
      :open="browse.open"
      :preview="browse.preview"
      :in-bar="inBar"
      :label="t('dock.files.openFiles')"
      :close-label="(name) => t('dock.files.closeFile', { name })"
      @select="browse.open = $event"
      @pin="store.pin(place.chatId, $event)"
      @close="store.closeFile(place.chatId, $event)"
    >
      <template #icon="{ item }">
        <FilesIcon :name="item.name" class="size-3.5!" />
      </template>
      <template #menu="{ item }">
        <FilesMenu :place="place" :root="root" :target="{ path: item.key, folder: false }" />
      </template>
    </ShellEditorTabs>
    <FilesViewer v-if="browse.open" :key="browse.open" :place="place" :root="root" :file="browse.open" class="min-h-0 flex-1" />
  </div>
</template>
