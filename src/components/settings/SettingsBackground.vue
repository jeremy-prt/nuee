<script setup lang="ts">
import { ImagePlus } from '@/components/ui/icons'
import { ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsBackgroundFit from '@/components/settings/SettingsBackgroundFit.vue'
import SettingsBackgroundOptions from '@/components/settings/SettingsBackgroundOptions.vue'
import SettingsBackgroundThumb from '@/components/settings/SettingsBackgroundThumb.vue'
import SettingsHeading from '@/components/settings/SettingsHeading.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { forgetBackground } from '@/composables/useBackgroundImage'
import { useFileDrop } from '@/composables/useFileDrop'
import { useResetToast } from '@/composables/useResetToast'
import { backgroundImport, backgroundRemove } from '@/ipc/background'
import { IMAGE_EXTENSIONS, pickImage } from '@/ipc/dialog'
import { useAppearanceStore } from '@/stores/appearance'

const { t } = useI18n()
const resetToast = useResetToast()
const appearance = useAppearanceStore()
const zone = useTemplateRef('zone')
const error = ref('')
// Une grosse image met une seconde à être copiée : le bouton le montre.
const importing = ref(false)
const removing = ref(false)

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
  removing.value = true
  try {
    await backgroundRemove()
  } catch (cause) {
    error.value = t('settings.background.failedRemove', { detail: (cause as { message?: string }).message ?? String(cause) })
    return
  } finally {
    removing.value = false
  }
  appearance.setBackground(null)
  if (previous) forgetBackground(previous)
}

const { over } = useFileDrop(zone, (paths) => use(paths[0]!), true)
</script>

<template>
  <section class="pt-8" aria-labelledby="background-title">
    <SettingsHeading id="background-title" :title="t('settings.background.title')">
      <SettingsResetButton v-if="appearance.background.path" @click="appearance.resetBackground(); resetToast('section')" />
    </SettingsHeading>
    <!-- Toute la liste reçoit l'image glissée depuis le Finder. -->
    <div
      ref="zone"
      class="overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none"
      :class="over ? 'border-ring bg-signal/10' : 'border-stroke bg-content/3'"
    >
      <div data-setting="background" data-setting-row class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stroke px-4 py-2.5 last:border-b-0">
        <div class="flex min-w-40 flex-1 items-center gap-3">
          <SettingsBackgroundThumb v-if="appearance.background.path" :path="appearance.background.path" class="w-32 shrink-0" />
          <template v-else>
            <span class="grid aspect-video w-32 shrink-0 place-items-center rounded-md border border-dashed border-stroke" aria-hidden="true">
              <ImagePlus class="size-5 text-muted" />
            </span>
            <p class="min-w-0 flex-1 text-xs/relaxed text-muted">{{ t('settings.background.drop') }}</p>
          </template>
        </div>
        <div v-if="appearance.background.path" class="flex flex-wrap gap-2">
          <UiButton size="sm" :loading="importing" :disabled="removing" @click="choose()">{{ t('settings.background.change') }}</UiButton>
          <UiButton size="sm" variant="danger" :loading="removing" :disabled="importing" @click="remove()">{{ t('settings.background.remove') }}</UiButton>
        </div>
        <UiButton v-else size="sm" :loading="importing" @click="choose()">{{ t('settings.background.choose') }}</UiButton>
      </div>
      <template v-if="appearance.background.path">
        <SettingsBackgroundFit :path="appearance.background.path" />
        <SettingsBackgroundOptions :path="appearance.background.path" />
      </template>
    </div>
    <p aria-live="polite" class="mt-2 text-sm text-danger empty:mt-0">{{ error }}</p>
  </section>
</template>
