<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatCodeBlock from '@/components/chat/ChatCodeBlock.vue'
import ChatImageMenu from '@/components/chat/ChatImageMenu.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'

// Bloc ```svg d'une réponse : l'image d'abord, le code à un clic, clic droit pour la copier. En `<img>` : un SVG
// n'y exécute ni script ni ressource externe, sans conversion ni nettoyage.
const props = defineProps<{ code: string; block?: string }>()
const { t } = useI18n()
const view = ref<'preview' | 'code'>('preview')
const src = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.code)}`)
const options = computed(() => [
  { value: 'preview' as const, label: t('chat.svg.preview') },
  { value: 'code' as const, label: t('chat.svg.code') },
])
</script>

<template>
  <div class="my-2 flex flex-col items-start gap-1.5">
    <UiSegmented v-model="view" :label="t('chat.svg.label')" :options="options" class="text-xs" />
    <ChatImageMenu v-if="view === 'preview'" :src="src" :svg="code">
      <UiImagePreview :src="src" :alt="t('chat.svg.alt')">
        <img :src="src" :alt="t('chat.svg.alt')" class="max-h-80 max-w-full rounded-lg border border-stroke bg-white/5 object-contain p-2" />
      </UiImagePreview>
    </ChatImageMenu>
    <ChatCodeBlock v-else :code="code" lang="svg" :block="block" class="w-full" />
  </div>
</template>
