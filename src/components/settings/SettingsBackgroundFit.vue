<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { sampleBackground } from '@/composables/useBackgroundImage'
import { INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'
import { useToastsStore } from '@/stores/toasts'

const props = defineProps<{ path: string }>()

const { t } = useI18n()
const appearance = useAppearanceStore()
const toasts = useToastsStore()
const busy = ref(false)

// Une seule mesure, au clic : ensuite chaque réglage reste à la main de l'utilisateur.
async function fit(event: MouseEvent) {
  busy.value = true
  try {
    const card = (event.currentTarget as HTMLElement).closest('main')?.getBoundingClientRect()
    const aspect = card?.height ? card.width / card.height : 1.6
    const { effect, intensity } = appearance.background
    const pixels = await sampleBackground(props.path, effect, INTENSITY_LEVEL[intensity], aspect)
    const style = appearance.effectiveStyle
    const changes = appearance.fitToImage(pixels)
    const labels = [
      ...changes.glass.map((setting) =>
        setting === 'opacity' && style === 'mixed' ? t('settings.glass.opacity.bars') : t(`settings.glass.${setting}.label`),
      ),
      ...changes.background.map((setting) => t(`settings.background.${setting}.label`)),
    ]
    if (labels.length) toasts.push({ kind: 'success', title: t('settings.background.fit.done'), body: labels.join(' · ') })
    else toasts.push({ kind: 'info', title: t('settings.background.fit.unchanged'), body: '' })
  } catch (error) {
    console.error('lisibilité du fond', error)
    toasts.push({ kind: 'error', title: t('settings.background.fit.failed'), body: '' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsRow v-slot="{ hintId }" data-setting="background-fit" :label="t('settings.background.fit.label')" :hint="t('settings.background.fit.hint')">
    <UiButton size="sm" :loading="busy" :aria-describedby="hintId" @click="fit($event)">{{ t('settings.background.fit.action') }}</UiButton>
  </SettingsRow>
</template>
