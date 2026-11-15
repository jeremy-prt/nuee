<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { Info } from '@/components/ui/icons'

// Bouton « i » posé dans le bouton Nettoyer : une ligne par catégorie cochée, `empty` si aucune ne l'est.
defineProps<{ items: string[]; empty: string }>()
const { t } = useI18n()
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger
      class="grid size-6 place-items-center rounded-full text-current opacity-75 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring aria-expanded:opacity-100"
      :aria-label="t('cleanup.plan.title')"
    >
      <Info class="size-4" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent side="bottom" align="center" :side-offset="12" :collision-padding="8" class="ui-pop z-50 w-72 p-3 text-xs text-content">
        <p class="text-[13px] font-medium">{{ t('cleanup.plan.title') }}</p>
        <ul v-if="items.length" class="mt-2 flex list-disc flex-col gap-1.5 ps-4 leading-snug marker:text-muted">
          <li v-for="item in items" :key="item">{{ item }}</li>
        </ul>
        <p v-else class="mt-2 text-muted">{{ empty }}</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
