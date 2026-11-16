<script setup lang="ts">
import { Check, FileImage } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatCodeBlock from '@/components/chat/ChatCodeBlock.vue'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { useToastsStore } from '@/stores/toasts'

// Bloc ```svg d'une réponse : l'image d'abord, le code à un clic, copiable en SVG ou en PNG. En `<img>` : un SVG n'y
// exécute ni script ni ressource externe, sans conversion ni nettoyage.
const props = defineProps<{ code: string; block?: string }>()
const { t } = useI18n()
const toasts = useToastsStore()
const view = ref<'preview' | 'code'>('preview')
const src = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.code)}`)
const options = computed(() => [
  { value: 'preview' as const, label: t('chat.svg.preview') },
  { value: 'code' as const, label: t('chat.svg.code') },
])

// Rendu au double de sa taille (512 px de côté sans taille déclarée) pour rester net une fois collé.
async function png() {
  const image = new Image()
  image.src = src.value
  await image.decode()
  const width = image.naturalWidth || 512
  const height = image.naturalHeight || 512
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'))
}

const copiedPng = ref(false)
async function copyPng() {
  try {
    // La promesse passe telle quelle : WebKit n'accepte l'écriture que dans le geste du clic.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })])
  } catch {
    toasts.push({ kind: 'error', title: t('chat.svg.copyFailed'), body: '' })
    return
  }
  copiedPng.value = true
  window.setTimeout(() => (copiedPng.value = false), 1500)
}
</script>

<template>
  <div class="my-2 flex flex-col items-start gap-1.5">
    <div class="flex items-center gap-1">
      <UiSegmented v-model="view" :label="t('chat.svg.label')" :options="options" class="text-xs" />
      <ChatCopyButton :text="() => code" :label="t('chat.svg.copy')" />
      <UiIconButton :label="copiedPng ? t('chat.svg.copiedPng') : t('chat.svg.copyPng')" @click="copyPng">
        <Check v-if="copiedPng" class="size-3.5" aria-hidden="true" />
        <FileImage v-else class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>
    <UiImagePreview v-if="view === 'preview'" :src="src" :alt="t('chat.svg.alt')">
      <img :src="src" :alt="t('chat.svg.alt')" class="max-h-80 max-w-full rounded-lg border border-stroke bg-white/5 object-contain p-2" />
    </UiImagePreview>
    <ChatCodeBlock v-else :code="code" lang="svg" :block="block" class="w-full" />
  </div>
</template>
