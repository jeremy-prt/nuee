<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAppearance from '@/components/settings/SettingsAppearance.vue'
import SettingsBackground from '@/components/settings/SettingsBackground.vue'
import SettingsBackgroundOptions from '@/components/settings/SettingsBackgroundOptions.vue'
import SettingsGlass from '@/components/settings/SettingsGlass.vue'
import SettingsInterface from '@/components/settings/SettingsInterface.vue'
import SettingsThemeOptions from '@/components/settings/SettingsThemeOptions.vue'
import SettingsThemes from '@/components/settings/SettingsThemes.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useNavigationStore } from '@/stores/navigation'

// ===== Initialisation =====
const { t } = useI18n()
const navigation = useNavigationStore()
const root = useTemplateRef('root')
const page = useTemplateRef('page')
const heading = useTemplateRef('heading')

// Changer de section ou de sous-page fait apparaître la nouvelle en fondu, comme dans Brume.
watch(
  () => [navigation.settingsSection, navigation.settingsDetail],
  async () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    await nextTick()
    root.value?.scrollTo({ top: 0 })
    page.value?.animate(
      { opacity: [0, 1], transform: ['translateY(4px)', 'none'] },
      { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  },
)

// Le bouton qui a ouvert la sous-page disparaît avec elle : on lui rend le focus au retour.
watch(
  () => navigation.settingsDetail,
  async (detail, previous) => {
    await nextTick()
    if (detail) heading.value?.focus()
    else if (previous) root.value?.querySelector<HTMLElement>(`[data-customize="${previous}"]`)?.focus()
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
  <div ref="root" class="@container h-full overflow-y-auto">
    <div ref="page" class="mx-auto w-full max-w-4xl px-6 py-8 pb-16 @2xl:px-10 @4xl:px-14">
      <template v-if="navigation.settingsDetail">
        <div class="-ms-1.5 flex items-center gap-1.5">
          <UiIconButton :label="t('settings.backTo', { section: t('settings.sections.appearance') })" @click="back()">
            <ArrowLeft class="size-4" aria-hidden="true" />
          </UiIconButton>
          <h2 ref="heading" tabindex="-1" class="text-xl font-semibold outline-none">
            <template v-if="navigation.settingsDetail === 'theme' || navigation.settingsDetail === 'background'">
              {{ t(navigation.settingsDetailKey) }}
            </template>
            <template v-else>{{ t('settings.glass.heading', { style: t(navigation.settingsDetailKey) }) }}</template>
          </h2>
        </div>
        <SettingsThemeOptions v-if="navigation.settingsDetail === 'theme'" />
        <SettingsBackgroundOptions v-else-if="navigation.settingsDetail === 'background'" />
        <SettingsGlass v-else :window-style="navigation.settingsDetail" />
      </template>
      <template v-else>
        <h2 class="text-xl font-semibold">{{ t(`settings.sections.${navigation.settingsSection}`) }}</h2>
        <p class="mt-1.5 max-w-xl text-sm text-muted">{{ t(`settings.hints.${navigation.settingsSection}`) }}</p>
        <template v-if="navigation.settingsSection === 'appearance'">
          <SettingsThemes />
          <SettingsAppearance />
          <SettingsBackground />
          <SettingsInterface />
        </template>
      </template>
    </div>
  </div>
</template>
