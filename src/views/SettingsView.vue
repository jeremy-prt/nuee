<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAbout from '@/components/settings/SettingsAbout.vue'
import SettingsAgent from '@/components/settings/SettingsAgent.vue'
import SettingsAgents from '@/components/settings/SettingsAgents.vue'
import SettingsAppearance from '@/components/settings/SettingsAppearance.vue'
import SettingsBackground from '@/components/settings/SettingsBackground.vue'
import SettingsBackgroundOptions from '@/components/settings/SettingsBackgroundOptions.vue'
import SettingsGlass from '@/components/settings/SettingsGlass.vue'
import SettingsInterface from '@/components/settings/SettingsInterface.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsShortcuts from '@/components/settings/SettingsShortcuts.vue'
import SettingsNotifications from '@/components/settings/SettingsNotifications.vue'
import SettingsSystem from '@/components/settings/SettingsSystem.vue'
import SettingsThemeOptions from '@/components/settings/SettingsThemeOptions.vue'
import SettingsThemes from '@/components/settings/SettingsThemes.vue'
import SettingsUpdates from '@/components/settings/SettingsUpdates.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isAgentDetail, type SettingsDetail, settingsDetailTitle, useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'

// ===== Initialisation =====
const { t } = useI18n()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const root = useTemplateRef('root')
const heading = useTemplateRef('heading')

// Nouvelle section ou sous-page : on repart du haut (le fondu enchaîné est dans stores/navigation.ts).
watch(
  () => [navigation.settingsSection, navigation.settingsDetail],
  () => root.value?.scrollTo({ top: 0 }),
)

// Au retour, le focus ne revient sur « Personnaliser » que si Retour a été validé au clavier (`detail` à 0) :
// après un clic ou Échap, il ne saute nulle part. Le titre de la sous-page, lui, ne montre pas d'anneau.
let restoreFocus = false
watch(
  () => navigation.settingsDetail,
  async (detail, previous) => {
    const restore = restoreFocus
    // Arrivé par la recherche : c'est elle qui place le focus.
    const revealing = navigation.revealed
    restoreFocus = false
    await nextTick()
    if (revealing) return
    if (detail) heading.value?.focus()
    else if (previous && restore) root.value?.querySelector<HTMLElement>(`[data-customize="${previous}"]`)?.focus()
  },
)

// Réglage choisi dans la recherche : défilé au centre et mis en avant ; choisi au clavier, le focus va sur sa commande.
watch(
  () => navigation.revealed,
  (target) => {
    if (!target) return
    navigation.revealed = null
    const element = target.id ? root.value?.querySelector<HTMLElement>(`[data-setting="${target.id}"]`) : null
    if (!element) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    element.classList.remove('setting-found')
    void element.offsetWidth
    element.classList.add('setting-found')
    setTimeout(() => element.classList.remove('setting-found'), 1800)
    if (!target.focus) return
    const control = element.querySelector<HTMLElement>('input:checked') ?? element.querySelector<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')
    control?.focus({ preventScroll: true })
  },
  { flush: 'post' },
)

const isWindowStyle = (detail: SettingsDetail) => detail === 'transparent' || detail === 'mixed' || detail === 'opaque'

function back(event?: MouseEvent) {
  restoreFocus = event?.detail === 0
  navigation.showSettingsDetail(null)
}

// Échap venu d'un menu, d'une confirmation ou d'un message ne ferme que lui : reka-ui le traite sans
// marquer l'évènement (defaultPrevented reste faux), d'où le test sur l'élément qui a reçu la touche.
function onKeydown(event: KeyboardEvent) {
  if (shortcuts.matches(event, 'searchSettings')) {
    event.preventDefault()
    document.getElementById('settings-search')?.focus()
    return
  }
  if (!shortcuts.matches(event, 'closeSettings') || event.defaultPrevented || event.isComposing) return
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
          <UiIconButton :label="t('settings.backTo', { section: t(`settings.sections.${navigation.settingsSection}`) })" @click="back($event)">
            <ArrowLeft class="size-4" aria-hidden="true" />
          </UiIconButton>
          <h2 ref="heading" tabindex="-1" class="text-xl font-semibold outline-none">
            <template v-if="isWindowStyle(navigation.settingsDetail)">
              {{ t('settings.glass.heading', { style: settingsDetailTitle(navigation.settingsDetail, t) }) }}
            </template>
            <template v-else>{{ settingsDetailTitle(navigation.settingsDetail, t) }}</template>
          </h2>
        </div>
        <SettingsThemeOptions v-if="navigation.settingsDetail === 'theme'" />
        <SettingsBackgroundOptions v-else-if="navigation.settingsDetail === 'background'" />
        <SettingsAgent v-else-if="isAgentDetail(navigation.settingsDetail)" :kind="navigation.settingsDetail" />
        <SettingsGlass v-else :window-style="navigation.settingsDetail" />
      </template>
      <template v-else>
        <div class="flex items-end gap-4">
          <div class="min-w-0 flex-1">
            <h2 class="text-xl font-semibold">{{ t(`settings.sections.${navigation.settingsSection}`) }}</h2>
            <p class="mt-1.5 max-w-xl text-sm text-muted">{{ t(`settings.hints.${navigation.settingsSection}`) }}</p>
          </div>
          <SettingsResetButton v-if="navigation.settingsSection === 'shortcuts'" @click="shortcuts.reset()" />
        </div>
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
        <SettingsShortcuts v-else-if="navigation.settingsSection === 'shortcuts'" />
        <SettingsAgents v-else-if="navigation.settingsSection === 'agents'" />
      </template>
    </div>
  </div>
</template>
