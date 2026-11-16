<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { filesRead } from '@/ipc/files'
import { codeRunPlaceKey } from '@/stores/codeRuns'

// Image d'une réponse d'agent (`![](…)`), comme T3 Code et monocode : `data:` affichée telle quelle, fichier du dossier
// de la session lu par Rust (borné à ce dossier), le reste (web, hors du dossier) gardé en texte : la CSP bloque les
// images distantes. Toujours en `<img>`, où un SVG n'exécute ni script ni ressource externe.
const props = defineProps<{ src: string; alt: string }>()
const context = inject(codeRunPlaceKey, null)
const shown = ref<string | null>(null)

function relative(src: string) {
  const place = context?.value.place
  const root = (place?.worktree ? place.worktreePath : place?.cwd)?.replace(/\/+$/, '')
  const path = decodeURI(src.replace(/^file:\/\//, ''))
  if (!path.startsWith('/')) return path.replace(/^\.\//, '')
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null
}

async function load(src: string) {
  shown.value = null
  if (/^data:image\//.test(src)) return void (shown.value = src)
  if (/^[a-z]+:/i.test(src) && !src.startsWith('file:')) return
  const file = relative(src)
  const place = context?.value.place
  if (!file || !context || !place?.cwd) return
  try {
    const { body } = await filesRead({ chatId: context.value.chatId, path: place.cwd, worktree: place.worktree ? place.worktreePath : null }, file)
    if (body.kind === 'image') shown.value = body.data
    else if (body.kind === 'text' && /\.svg$/i.test(file)) shown.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body.text)}`
  } catch {
    // Fichier absent ou hors du dossier : la légende reste.
  }
}
watch(() => props.src, load, { immediate: true })
</script>

<template>
  <UiImagePreview v-if="shown" :src="shown" :alt="alt || src" class="my-2 inline-block">
    <img :src="shown" :alt="alt" class="max-h-80 max-w-full rounded-lg border border-stroke bg-white/5 object-contain" />
  </UiImagePreview>
  <span v-else :title="src">{{ alt || src }}</span>
</template>
