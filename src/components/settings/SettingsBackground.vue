<script setup lang="ts">
import { ImagePlus } from '@lucide/vue'
import { ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsBackgroundThumb from '@/components/settings/SettingsBackgroundThumb.vue'
import SettingsCustomizeButton from '@/components/settings/SettingsCustomizeButton.vue'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { forgetBackground } from '@/composables/useBackgroundImage'
import { useFileDrop } from '@/composables/useFileDrop'
import { backgroundImport, backgroundRemove } from '@/ipc/background'
import { IMAGE_EXTENSIONS, pickImage } from '@/ipc/dialog'
import { useAppearanceStore } from '@/stores/appearance'
import { useNavigationStore } from '@/stores/navigation'

const { t } = useI18n()
const appearance = useAppearanceStore()
const navigation = useNavigationStore()
const zone = useTemplateRef('zone')
const error = ref('')
// Une grosse image met une seconde à être copiée : le bouton le montre.
const importing = ref(false)

async function use(path: string) {
  error.value = ''
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    error.value = t('settings.background.unsupported')
    return
  }
  importing.value = true
  try {
    const previous = appearance.background.path
    appearance.setBackground(await backgroundImport(path))
    // Rust a supprimé l'ancien fichier : ses calculs gardés en mémoire partent aussi.
    if (previous) forgetBackground(previous)
  } catch (cause) {
    const detail = (cause as { message?: string }).message ?? String(cause)
    error.value = t('settings.background.failed', { detail })
  } finally {
    importing.value = false
  }
}

async function choose() {
  const path = await pickImage(t('settings.background.pickTitle'))
  if (path) await use(path)
}

// Le fichier copié est supprimé du disque : si ça échoue, l'image reste affichée plutôt que d'y traîner en cachette.
async function remove() {
  error.value = ''
  const previous = appearance.background.path
  try {
    await backgroundRemove()
  } catch (cause) {
    error.value = t('settings.background.failedRemove', { detail: (cause as { message?: string }).message ?? String(cause) })
    return
  }
  appearance.setBackground(null)
  if (previous) forgetBackground(previous)
}

const { over } = useFileDrop(zone, (paths) => use(paths[0]!), true)
</script>

<template>
  <section class="pt-8" aria-labelledby="background-title">
    <SettingsHeading id="background-title" :title="t('settings.background.title')" />
    <div
      ref="zone"
      data-setting="background"
      class="relative rounded-xl border p-3 transition-colors motion-reduce:transition-none"
      :class="over ? 'border-ring bg-selection/40' : appearance.background.path ? 'border-stroke' : 'border-dashed border-stroke'"
    >
      <div v-if="appearance.background.path" class="flex flex-wrap items-center gap-4">
        <SettingsBackgroundThumb :path="appearance.background.path" class="w-48" />
        <div class="flex flex-wrap gap-2">
          <UiButton :loading="importing" @click="choose()">{{ t('settings.background.change') }}</UiButton>
          <UiButton variant="ghost" :disabled="importing" @click="remove()">{{ t('settings.background.remove') }}</UiButton>
        </div>
        <SettingsCustomizeButton
          show
          data-customize="background"
          class="top-3 end-3"
          :label="t('settings.background.customize')"
          @click="navigation.showSettingsDetail('background')"
        />
      </div>
      <div v-else class="flex flex-col items-center gap-3 py-6 text-center">
        <ImagePlus class="size-6 text-muted" aria-hidden="true" />
        <p class="text-sm text-muted">{{ t('settings.background.drop') }}</p>
        <UiButton :loading="importing" @click="choose()">{{ t('settings.background.choose') }}</UiButton>
      </div>
    </div>
    <p aria-live="polite" class="mt-2 min-h-5 text-sm text-danger">{{ error }}</p>
  </section>
</template>
