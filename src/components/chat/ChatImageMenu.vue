<script setup lang="ts">
import { Copy, FileImage } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import { copyImage } from '@/composables/useImageCopy'
import { useToastsStore } from '@/stores/toasts'

// Clic droit sur une image de la conversation : la copier en PNG, et le code d'un SVG quand on l'a.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ src: string; svg?: string }>()
const { t } = useI18n()
const toasts = useToastsStore()

function copyPng() {
  copyImage(props.src).catch(() => toasts.push({ kind: 'error', title: t('chat.svg.copyFailed'), body: '' }))
}
function copySvg() {
  if (props.svg) navigator.clipboard.writeText(props.svg).catch(() => {})
}
</script>

<template>
  <UiContextMenu v-bind="$attrs">
    <slot />
    <template #menu>
      <UiMenuItem :label="t('chat.svg.copyImage')" :icon="FileImage" @select="copyPng" />
      <UiMenuItem v-if="svg" :label="t('chat.svg.copy')" :icon="Copy" @select="copySvg" />
    </template>
  </UiContextMenu>
</template>
