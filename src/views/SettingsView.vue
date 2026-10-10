<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAbout from '@/components/settings/SettingsAbout.vue'
import SettingsAppearance from '@/components/settings/SettingsAppearance.vue'
import SettingsBackground from '@/components/settings/SettingsBackground.vue'
import SettingsBackgroundOptions from '@/components/settings/SettingsBackgroundOptions.vue'
import SettingsGlass from '@/components/settings/SettingsGlass.vue'
import SettingsInterface from '@/components/settings/SettingsInterface.vue'
import SettingsNotifications from '@/components/settings/SettingsNotifications.vue'
import SettingsSystem from '@/components/settings/SettingsSystem.vue'
import SettingsThemeOptions from '@/components/settings/SettingsThemeOptions.vue'
import SettingsThemes from '@/components/settings/SettingsThemes.vue'
import SettingsUpdates from '@/components/settings/SettingsUpdates.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useNavigationStore } from '@/stores/navigation'

// ===== Initialisation =====
const { t } = useI18n()
const navigation = useNavigationStore()
const root = useTemplateRef('root')
const heading = useTemplateRef('heading')

// Nouvelle section ou sous-page : on repart du haut (le fondu enchaîné est dans stores/navigation.ts).
watch(
  () => [navigation.settingsSection, navigation.settingsDetail],
  () => root.value?.scrollTo({ top: 0 }),
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
  navigation.showSettingsDetail(null)
}

// Échap venu d'un menu, d'une confirmation ou d'un message ne ferme que lui : reka-ui le traite sans
// marquer l'évènement (defaultPrevented reste faux), d'où le test sur l'élément qui a reçu la touche.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  if ((event.target as Element | null)?.closest?.('[data-reka-popper-content-wrapper], [role="dialog"], [role="alertdialog"], .ui-toast')) return
  event.preventDefault()
  if (navigation.settingsDetail) back()
  else navigation.closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div ref="root" class="@container h-full overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-6 py-8 pb-16 @2xl:px-10 @4xl:px-14">
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
        <template v-if="navigation.settingsSection === 'general'">
          <SettingsSystem />
          <SettingsNotifications />
          <SettingsUpdates />
          <SettingsAbout />
        </template>
        <template v-else-if="navigation.settingsSection === 'appearance'">
          <SettingsThemes />
          <SettingsAppearance />
          <SettingsBackground />
          <SettingsInterface />
        </template>
      </template>
    </div>
  </div>
</template>
