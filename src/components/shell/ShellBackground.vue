<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ShellBackgroundImage from '@/components/shell/ShellBackgroundImage.vue'
import { preloadBackground } from '@/composables/useBackgroundImage'
import { BACKGROUND_OPACITY, INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

const appearance = useAppearanceStore()
const navigation = useNavigationStore()

// Jamais derrière les Réglages, qu'elle rendrait difficiles à lire.
const shown = computed(() => {
  if (navigation.view === 'settings') return false
  return navigation.view === 'chats' || appearance.background.where === 'everywhere'
})
// Toujours monté (zone centrale) : il prépare les vignettes d'effets dès le lancement et à chaque image.
watch(
  () => [appearance.background.path, appearance.background.intensity] as const,
  ([path, intensity]) => {
    if (path) preloadBackground(path, INTENSITY_LEVEL[intensity])
  },
  { immediate: true },
)

const opacity = computed(() => (shown.value ? BACKGROUND_OPACITY[appearance.background.visibility] / 100 : 0))

// Un changement de vue a déjà son fondu enchaîné (View Transitions) : un second fondu sur l'opacité finirait après
// lui, et le fond remonterait d'un coup à la fin de la capture (clignotement). Seuls les réglages d'Apparence l'animent.
const animated = ref(true)
watch(
  () => navigation.view,
  () => {
    animated.value = false
    requestAnimationFrame(() => requestAnimationFrame(() => (animated.value = true)))
  },
  { flush: 'sync' },
)
</script>

<template>
  <div
    v-if="appearance.background.path"
    class="pointer-events-none absolute inset-0 -z-10 overflow-hidden motion-reduce:transition-none"
    :class="{ 'transition-opacity duration-500': animated }"
    :style="{ opacity }"
  >
    <ShellBackgroundImage
      :path="appearance.background.path"
      :effect="appearance.background.effect"
      :level="INTENSITY_LEVEL[appearance.background.intensity]"
      :darken="appearance.background.darken"
    />
  </div>
</template>
