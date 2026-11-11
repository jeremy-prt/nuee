<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FilesIcon from '@/components/files/FilesIcon.vue'
import FilesMenu from '@/components/files/FilesMenu.vue'
import FilesViewer from '@/components/files/FilesViewer.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
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
// Comme T3 Code, les onglets montent dans la barre de titre (`ShellTitleBar` leur garde la place au-dessus de
// l'éditeur) ; dessous, la ligne d'outils du fichier tient celle de l'arborescence.
const inBar = computed(() => layout.spans('files'))

function onAuxClick(event: MouseEvent, file: string) {
  if (event.button === 1) store.closeFile(props.place.chatId, file)
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <Teleport defer to="#dock-editor-tabs" :disabled="!inBar">
      <div
        class="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto"
        :class="inBar ? 'h-full min-w-0 flex-1' : 'h-9 shrink-0 border-b border-stroke ps-1.5 pe-2.5'"
        role="tablist"
        :aria-label="t('dock.files.openFiles')"
      >
        <UiContextMenu v-for="file in browse.tabs" :key="file" class="group/tab relative w-44 min-w-24 shrink">
          <button
            type="button"
            role="tab"
            class="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            :class="browse.open === file ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
            :aria-selected="browse.open === file"
            :title="file"
            @click="browse.open = file"
            @dblclick="store.pin(place.chatId, file)"
            @auxclick="onAuxClick($event, file)"
          >
            <FilesIcon :name="nameOf(file)" class="size-3.5!" />
            <span class="min-w-0 truncate" :class="{ italic: browse.preview === file }">{{ nameOf(file) }}</span>
          </button>
          <button
            type="button"
            class="absolute end-1 top-1 grid size-5 place-items-center rounded text-muted hover:bg-selection-inner hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            :class="browse.open === file ? '' : 'opacity-0 group-hover/tab:opacity-100'"
            :aria-label="t('dock.files.closeFile', { name: nameOf(file) })"
            @click="store.closeFile(place.chatId, file)"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
          <template #menu>
            <FilesMenu :place="place" :root="root" :target="{ path: file, folder: false }" />
          </template>
        </UiContextMenu>
      </div>
    </Teleport>
    <FilesViewer v-if="browse.open" :key="browse.open" :place="place" :root="root" :file="browse.open" class="min-h-0 flex-1" />
  </div>
</template>
