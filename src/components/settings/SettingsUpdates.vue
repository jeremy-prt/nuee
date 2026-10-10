<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { appVersion, openGithubPage } from '@/ipc/system'
import { useGeneralStore } from '@/stores/general'
import { useUpdatesStore } from '@/stores/updates'

const RELEASES = 'https://github.com/jeremy-prt/nuee/releases'

const { t } = useI18n()
const general = useGeneralStore()
const updates = useUpdatesStore()
const version = ref('')

onMounted(async () => {
  version.value = await appVersion().catch(() => '')
})

// Pendant la recherche, seul le bouton bouge : le résultat n'apparaît qu'une fois connu.
const result = computed(() => {
  if (updates.status === 'upToDate') return { text: t('updates.upToDate'), tone: 'text-muted' }
  if (updates.status === 'failed') return { text: t('updates.failed'), tone: 'text-danger' }
  if (updates.status === 'available' && updates.latest) {
    return { text: t('updates.available', { version: updates.latest.version }), tone: 'text-accent' }
  }
  return null
})
</script>

<template>
  <SettingsGroup :title="t('settings.general.updates.title')">
    <SettingsRow :label="t('settings.general.updates.version')">
      <template #hint>
        <span>Nuée {{ version }}</span>
        <span aria-live="polite">
          <Transition
            enter-active-class="transition-opacity duration-300 ease-out motion-reduce:transition-none"
            enter-from-class="opacity-0"
          >
            <span v-if="result" :key="result.text" :class="result.tone"> · {{ result.text }}</span>
          </Transition>
        </span>
      </template>
      <div class="flex items-center gap-2">
        <UiButton size="sm" @click="openGithubPage(RELEASES)">{{ t('settings.general.updates.notes') }}</UiButton>
        <UiButton
          v-if="updates.status === 'available' && updates.latest"
          size="sm"
          variant="primary"
          @click="openGithubPage(updates.latest.url)"
        >
          {{ t('updates.view') }}
        </UiButton>
        <UiButton v-else size="sm" :loading="updates.status === 'checking'" @click="updates.check()">
          {{ t('updates.check') }}
        </UiButton>
      </div>
    </SettingsRow>
    <SettingsRow
      v-slot="{ hintId }"
      :label="t('settings.general.updates.checkOnLaunch')"
      :hint="t('settings.general.updates.checkOnLaunchHint')"
    >
      <UiSwitch v-model="general.checkUpdates" :label="t('settings.general.updates.checkOnLaunch')" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>
</template>
