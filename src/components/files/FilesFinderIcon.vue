<script setup lang="ts">
import { FolderOpen } from '@/components/ui/icons'
import { isMacosApp } from '@/ipc/system'
import { useFilesStore } from '@/stores/files'

// Icône de « Afficher dans le Finder » : celle du Finder, lue sur le système, sinon un dossier ouvert.
const files = useFilesStore()
const mac = isMacosApp()
if (mac) files.loadEditors()
</script>

<template>
  <img v-if="mac && files.finderIcon" :src="files.finderIcon" alt="" draggable="false" />
  <FolderOpen v-else aria-hidden="true" />
</template>
