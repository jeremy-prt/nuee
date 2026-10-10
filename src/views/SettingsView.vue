<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNavigationStore } from '@/stores/navigation'

// ===== Initialisation =====
const { t } = useI18n()
const navigation = useNavigationStore()

// Une fenêtre ou une liste ouverte dans la page consomme Échap avant nous (defaultPrevented).
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  event.preventDefault()
  navigation.closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-8 py-8 pb-16">
      <h2 class="text-xl font-semibold">{{ t(`settings.sections.${navigation.settingsSection}`) }}</h2>
      <p class="mt-1.5 max-w-xl text-sm text-muted">{{ t(`settings.hints.${navigation.settingsSection}`) }}</p>
    </div>
  </div>
</template>
