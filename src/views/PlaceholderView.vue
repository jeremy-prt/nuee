<script setup lang="ts">
import { Gauge, Github, NotebookPen } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'

// Écrans pas encore construits : chacun aura sa propre vue quand il aura du contenu.
const props = defineProps<{ view: 'github' | 'notes' | 'usage' }>()

// GitHub et notes ont leur liste dans le panneau latéral : le centre attend une sélection.
const hasList = ['github', 'notes'].includes(props.view)

const { t } = useI18n()
const icons = { github: Github, notes: NotebookPen, usage: Gauge }
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
    <component :is="icons[props.view]" class="size-8 text-muted" aria-hidden="true" />
    <h2 class="text-lg font-semibold">{{ t(`rail.${props.view}`) }}</h2>
    <p class="max-w-sm text-sm text-muted">{{ hasList ? t(`select.${props.view}`) : t(`empty.${props.view}`) }}</p>
  </div>
</template>
