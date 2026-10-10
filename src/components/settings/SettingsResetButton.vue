<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="-me-2 -mb-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
  >
    <RotateCcw class="size-3.5" aria-hidden="true" />
    {{ t('settings.reset') }}
  </button>
</template>
