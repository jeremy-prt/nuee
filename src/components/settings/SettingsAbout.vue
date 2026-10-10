<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { forgetBackground } from '@/composables/useBackgroundImage'
import { backgroundRemove } from '@/ipc/background'
import { isTauriApp, openGithubPage } from '@/ipc/system'
import { useAppearanceStore } from '@/stores/appearance'
import { useDialogStore } from '@/stores/dialog'
import { useGeneralStore } from '@/stores/general'
import { useShortcutsStore } from '@/stores/shortcuts'

const REPOSITORY = 'https://github.com/jeremy-prt/nuee'

const links = [
  { key: 'source', url: REPOSITORY },
  { key: 'issue', url: `${REPOSITORY}/issues/new` },
  { key: 'license', url: `${REPOSITORY}/blob/main/LICENSE` },
] as const

const { t } = useI18n()
const appearance = useAppearanceStore()
const dialog = useDialogStore()
const general = useGeneralStore()
const shortcuts = useShortcutsStore()

async function resetAll() {
  const confirmed = await dialog.confirm({
    title: t('settings.general.reset.confirmTitle'),
    message: t('settings.general.reset.confirmMessage'),
    confirmLabel: t('settings.general.reset.confirm'),
    danger: true,
  })
  if (!confirmed) return
  general.reset()
  shortcuts.reset()
  const image = appearance.background.path
  appearance.resetAll()
  if (image && isTauriApp()) {
    backgroundRemove().catch((error) => console.error('image de fond', error))
    forgetBackground(image)
  }
}
</script>

<template>
  <SettingsGroup :title="t('settings.general.about.title')">
    <SettingsRow data-setting="about" :label="t('settings.general.about.openSource')">
      <div class="flex flex-wrap items-center gap-2">
        <UiButton v-for="link in links" :key="link.key" size="sm" @click="openGithubPage(link.url)">
          {{ t(`settings.general.about.${link.key}`) }}
          <ExternalLink class="size-3 text-muted" aria-hidden="true" />
        </UiButton>
      </div>
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="resetAll" :label="t('settings.general.reset.label')" :hint="t('settings.general.reset.hint')">
      <UiButton size="sm" variant="danger" :aria-describedby="hintId" @click="resetAll()">{{ t('settings.general.reset.button') }}</UiButton>
    </SettingsRow>
  </SettingsGroup>
</template>
