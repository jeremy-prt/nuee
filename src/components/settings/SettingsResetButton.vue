<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'

const { t } = useI18n()
</script>

<template>
  <UiButton size="sm">
    <RotateCcw class="size-3.5" aria-hidden="true" />{{ t('settings.reset') }}
  </UiButton>
</template>
