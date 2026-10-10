<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAppearance from '@/components/settings/SettingsAppearance.vue'
import SettingsGlass from '@/components/settings/SettingsGlass.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { WindowStyle } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

// ===== Initialisation =====
const { t } = useI18n()
const navigation = useNavigationStore()
const heading = useTemplateRef('heading')
// Le bouton qui a ouvert la sous-page disparaît avec elle : on lui rend le focus au retour.
const returnFocus = ref<WindowStyle | null>(null)

watch(
  () => navigation.settingsDetail,
  async (detail, previous) => {
    returnFocus.value = detail ? null : previous
    await nextTick()
    if (detail) heading.value?.focus()
  },
)

function back() {
  navigation.settingsDetail = null
}

// Une fenêtre ou une liste ouverte dans la page consomme Échap avant nous (defaultPrevented).
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  event.preventDefault()
  if (navigation.settingsDetail) back()
  else navigation.closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="@container h-full overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-6 py-8 pb-16 @2xl:px-10 @4xl:px-14">
      <template v-if="navigation.settingsDetail">
        <div class="-ms-1.5 flex items-center gap-1.5">
          <UiIconButton :label="t('settings.backTo', { section: t('settings.sections.appearance') })" @click="back()">
            <ArrowLeft class="size-4" aria-hidden="true" />
          </UiIconButton>
          <h2 ref="heading" tabindex="-1" class="text-xl font-semibold outline-none">
            {{ t('settings.glass.heading', { style: t(`settings.appearance.styles.${navigation.settingsDetail}`) }) }}
          </h2>
        </div>
        <SettingsGlass :window-style="navigation.settingsDetail" />
      </template>
      <template v-else>
        <h2 class="text-xl font-semibold">{{ t(`settings.sections.${navigation.settingsSection}`) }}</h2>
        <p class="mt-1.5 max-w-xl text-sm text-muted">{{ t(`settings.hints.${navigation.settingsSection}`) }}</p>
        <SettingsAppearance v-if="navigation.settingsSection === 'appearance'" :return-focus="returnFocus" />
      </template>
    </div>
  </div>
</template>
