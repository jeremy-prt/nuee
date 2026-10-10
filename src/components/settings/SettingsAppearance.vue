<script setup lang="ts">
import { SlidersHorizontal } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsWindowPreview from '@/components/settings/SettingsWindowPreview.vue'
import { isMacosApp } from '@/ipc/system'
import { type GlassValues, useAppearanceStore, type WindowStyle, windowStyles } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

const props = defineProps<{ returnFocus: WindowStyle | null }>()

const { t } = useI18n()
const appearance = useAppearanceStore()
const navigation = useNavigationStore()
const available = isMacosApp()
const root = useTemplateRef('root')

// Régler un style l'active aussi : la fenêtre sert d'aperçu pendant qu'on le règle.
function customize(style: WindowStyle) {
  appearance.windowStyle = style
  navigation.settingsDetail = style
}

onMounted(() => {
  if (props.returnFocus) root.value?.querySelector<HTMLElement>(`[data-customize="${props.returnFocus}"]`)?.focus()
})

// Écarts plus marqués que les vrais dosages : à cette taille, Mixte et Transparent se confondraient.
const previews: Record<WindowStyle, GlassValues> = {
  transparent: { chrome: 45, surface: 45, lightness: 9, tint: 0 },
  mixed: { chrome: 45, surface: 90, lightness: 9, tint: 0 },
  opaque: { chrome: 100, surface: 100, lightness: 9, tint: 0 },
}
</script>

<template>
  <section
    ref="root"
    class="pt-8"
    role="radiogroup"
    aria-labelledby="window-style-title"
    :aria-describedby="available ? undefined : 'window-style-hint'"
  >
    <h3 id="window-style-title" class="pb-2.5 text-sm font-semibold">{{ t('settings.appearance.window') }}</h3>
    <p v-if="!available" id="window-style-hint" class="mb-3 text-sm text-muted">{{ t('settings.appearance.macosOnly') }}</p>

    <div class="grid grid-cols-3 gap-3">
      <!-- Hors macOS, seul Opaque s'applique : les deux autres restent visibles mais grisés. -->
      <div v-for="style in windowStyles" :key="style" class="relative" :class="{ 'opacity-50': !available && style !== 'opaque' }">
        <label
          class="flex flex-col gap-2 rounded-xl border p-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
          :class="[
            appearance.effectiveStyle === style ? 'border-accent bg-selection/40' : 'border-stroke hover:bg-selection/40',
            available ? 'cursor-pointer' : 'cursor-not-allowed',
          ]"
        >
          <input
            v-model="appearance.windowStyle"
            type="radio"
            name="window-style"
            :value="style"
            :disabled="!available"
            class="sr-only"
          />
          <SettingsWindowPreview :values="previews[style]" />
          <span class="px-1 pb-0.5 text-sm font-medium">{{ t(`settings.appearance.styles.${style}`) }}</span>
        </label>
        <Transition
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          enter-from-class="scale-75 opacity-0"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          leave-to-class="scale-75 opacity-0"
        >
          <button
            v-if="appearance.effectiveStyle === style"
            type="button"
            :data-customize="style"
            class="absolute top-3.5 end-3.5 grid size-7 cursor-pointer place-items-center rounded-md bg-content text-canvas shadow-md hover:bg-content/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :aria-label="t('settings.appearance.customize', { style: t(`settings.appearance.styles.${style}`) })"
            @click="customize(style)"
          >
            <SlidersHorizontal class="size-3.5" aria-hidden="true" />
          </button>
        </Transition>
      </div>
    </div>
  </section>
</template>
