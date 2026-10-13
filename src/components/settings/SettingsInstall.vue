<script setup lang="ts">
import { ExternalLink } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useInstallPage } from '@/composables/useInstallPage'
import type { InstallTool } from '@/ipc/install'

// Outil absent : Nuée ne l'installe pas, elle mène à sa page officielle (choix de Jérémy).
defineProps<{ tool: InstallTool; name: string }>()

const { t } = useI18n()
const openInstall = useInstallPage()
</script>

<template>
  <SettingsRow v-slot="{ hintId }" :data-setting="`${tool}-install`" :label="t('settings.install.title', { tool: name })" :hint="t('settings.install.hint')">
    <UiButton size="sm" variant="primary" :aria-describedby="hintId" @click="openInstall(tool)">
      <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('settings.install.open') }}
    </UiButton>
  </SettingsRow>
</template>
