<script setup lang="ts">
import { X } from '@/components/ui/icons'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Vignette qui s'ouvre en grand. Un clic sur l'image passe à sa taille réelle (défilable), un clic à côté ou Échap
// ferme. La racine (DialogRoot) ne rend aucun élément : classes et attributs vont au déclencheur.
defineOptions({ inheritAttrs: false })
defineProps<{ src: string; alt: string }>()

const { t } = useI18n()
const open = ref(false)
const actual = ref(false)
</script>

<template>
  <DialogRoot v-model:open="open" @update:open="actual = false">
    <DialogTrigger
      v-bind="$attrs"
      class="block cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      :aria-label="t('image.open', { name: alt })"
    >
      <slot />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="ui-overlay fixed inset-0 z-50 bg-black/80" />
      <DialogContent
        class="fixed inset-0 z-50 flex outline-none"
        :class="actual ? 'overflow-auto' : 'items-center justify-center p-10'"
        @click.self="open = false"
      >
        <DialogTitle class="sr-only">{{ alt }}</DialogTitle>
        <img
          :src="src"
          :alt="alt"
          class="select-none"
          :class="actual ? 'm-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-2xl'"
          @click="actual = !actual"
        />
        <DialogClose
          class="fixed end-4 top-4 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('image.close')"
        >
          <X class="size-4" aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
