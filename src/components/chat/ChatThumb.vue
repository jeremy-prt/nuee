<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { previewSrc } from '@/ipc/attachment'

// Vignette d'une image lue par l'agent, au bout de la ligne comme dans l'app Claude : survolée, elle s'agrandit avec
// le nom de l'outil (`caption`) ; un clic l'ouvre en grand. La racine ne rend aucun élément : les classes vont à la
// vignette.
defineOptions({ inheritAttrs: false })
defineProps<{ path: string; alt: string; caption: string }>()
</script>

<template>
  <HoverCardRoot :open-delay="300" :close-delay="100">
    <HoverCardTrigger as-child>
      <span v-bind="$attrs" class="inline-flex shrink-0">
        <UiImagePreview :src="previewSrc(path)" :alt="alt">
          <img :src="previewSrc(path)" :alt="alt" class="h-6 w-10 rounded border border-stroke object-cover" />
        </UiImagePreview>
      </span>
    </HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent side="top" :side-offset="6" class="ui-pop z-50 w-80 text-xs text-content">
        <img :src="previewSrc(path)" alt="" class="max-h-56 w-full bg-canvas object-contain" />
        <p class="truncate px-2.5 py-1.5">{{ caption }}</p>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
