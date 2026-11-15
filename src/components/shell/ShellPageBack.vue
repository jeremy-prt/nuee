<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@/components/ui/icons'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useNavigationStore } from '@/stores/navigation'

const { t } = useI18n()
const navigation = useNavigationStore()
</script>

<template>
  <UiIconButton :label="t('settings.back')" @click="navigation.leavePage()">
    <ArrowLeft class="size-4" aria-hidden="true" />
  </UiIconButton>
</template>
