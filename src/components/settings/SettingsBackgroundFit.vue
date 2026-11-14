<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Sparkles } from '@/components/ui/icons'
import UiButton from '@/components/ui/UiButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
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
    const before = { glass: { ...appearance.glass[style] }, background: { ...appearance.background } }
    const changes = appearance.fitToImage(pixels)
    const labels = [
      ...changes.glass.map((setting) =>
        setting === 'opacity' && style === 'mixed' ? t('settings.glass.opacity.bars') : t(`settings.glass.${setting}.label`),
      ),
      ...changes.background.map((setting) => t(`settings.background.${setting}.label`)),
    ]
    const undo = () => {
      Object.assign(appearance.glass[style], before.glass)
      Object.assign(appearance.background, before.background)
    }
    if (labels.length) {
      toasts.push({
        kind: 'success',
        title: t('settings.background.fit.done'),
        body: labels.join(' · '),
        action: { label: t('settings.background.fit.undo'), run: undo },
      })
    } else toasts.push({ kind: 'info', title: t('settings.background.fit.unchanged'), body: '' })
  } catch (error) {
    console.error('lisibilité du fond', error)
    toasts.push({ kind: 'error', title: t('settings.background.fit.failed'), body: '' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <!-- Bouton principal de la sous-page, en haut à droite : il règle aussi le style de fenêtre, pas seulement l'image. -->
  <UiTooltip :label="t('settings.background.fit.hint')" side="bottom">
    <UiButton variant="primary" data-setting="background-fit" :loading="busy" @click="fit($event)">
      <Sparkles class="size-4" aria-hidden="true" />{{ t('settings.background.fit.action') }}
    </UiButton>
  </UiTooltip>
</template>
