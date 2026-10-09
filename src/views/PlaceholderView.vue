<script setup lang="ts">
import { CircleDot, Gauge, GitPullRequest, NotebookPen, Settings } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

// Écrans pas encore construits : chacun aura sa propre vue quand il aura du contenu.
const props = defineProps<{ view: 'issues' | 'pullRequests' | 'notes' | 'usage' | 'settings' }>()

// Issues, PR et notes ont leur liste dans le panneau latéral : le centre attend une sélection.
const hasList = ['issues', 'pullRequests', 'notes'].includes(props.view)

const { t } = useI18n()
const icons = { issues: CircleDot, pullRequests: GitPullRequest, notes: NotebookPen, usage: Gauge, settings: Settings }
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
    <component :is="icons[props.view]" class="size-8 text-muted" aria-hidden="true" />
    <h2 class="text-lg font-semibold">{{ t(`rail.${props.view}`) }}</h2>
    <p class="max-w-sm text-sm text-muted">{{ hasList ? t(`select.${props.view}`) : t(`empty.${props.view}`) }}</p>
  </div>
</template>
