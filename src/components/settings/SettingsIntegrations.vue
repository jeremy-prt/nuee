<script setup lang="ts">
import { CircleCheck, ExternalLink, RefreshCw, SlidersHorizontal } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGithubAvatar from '@/components/settings/SettingsGithubAvatar.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import SettingsServiceLogo from '@/components/settings/SettingsServiceLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useInstallPage } from '@/composables/useInstallPage'
import { useIntegrationsStore } from '@/stores/integrations'
import { useNavigationStore } from '@/stores/navigation'

const { t } = useI18n()
const store = useIntegrationsStore()
const navigation = useNavigationStore()
const openInstall = useInstallPage()
store.load()

const status = computed(() => store.github)
const accounts = computed(() => (status.value?.state === 'ready' ? status.value.accounts : []))
const active = computed(() => accounts.value.find((account) => account.active && account.state === 'ok') ?? null)
const missing = computed(() => store.prefs.github && status.value?.state === 'missing')
// Actualiser n'a de sens que si gh manque ou ne connaît aucun compte utilisable. Il reste en place pendant la relecture.
const retry = computed(() => store.prefs.github && (!!store.error || (!!status.value && !active.value)))
</script>

<template>
  <div data-setting="integrations" class="flex flex-col gap-3 pt-8">
    <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <SettingsRow label="GitHub">
        <template #icon><SettingsServiceLogo id="github" :muted="!store.prefs.github" /></template>
        <template #hint>
          <span aria-live="polite">
            <template v-if="!store.prefs.github">{{ t('settings.github.off') }}</template>
            <span v-else-if="store.error" class="text-danger">{{ t('settings.github.unreachable') }}</span>
            <template v-else-if="!status">{{ t('settings.github.checking') }}</template>
            <span v-else-if="status.state === 'missing'" class="text-danger">{{ t('settings.install.notInstalled', { tool: 'GitHub CLI' }) }}</span>
            <span v-else-if="status.state === 'outdated'" class="text-danger">{{ t('settings.github.outdatedShort') }}</span>
            <template v-else-if="active">
              <span class="inline-flex items-center gap-1">
                <CircleCheck class="size-3 text-success" aria-hidden="true" />{{ t('settings.github.connectedAs', { login: active.login }) }}
              </span>
              · {{ t('settings.github.accountsCount', accounts.length) }}
            </template>
            <span v-else class="text-danger">{{ t('settings.github.signedOut') }}</span>
          </span>
        </template>
        <div class="flex items-center gap-1">
          <div v-if="store.prefs.github && accounts.length" class="me-2 flex -space-x-1.5" aria-hidden="true">
            <SettingsGithubAvatar v-for="account in accounts.slice(0, 3)" :key="`${account.host}/${account.login}`" :account="account" small />
          </div>
          <UiButton v-if="missing" size="sm" class="me-1" :aria-label="t('settings.install.installTool', { tool: 'GitHub CLI' })" @click="openInstall('gh')">
            <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('settings.install.install') }}
          </UiButton>
          <UiIconButton v-if="retry" :label="t('settings.github.refresh')" :loading="store.checking" @click="store.refresh()">
            <RefreshCw class="size-3.5" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton :label="t('settings.github.configure')" @click="navigation.showSettingsDetail('github')">
            <SlidersHorizontal class="size-3.5" aria-hidden="true" />
          </UiIconButton>
          <UiSwitch v-model="store.prefs.github" class="ms-1" :label="t('settings.github.useService')" />
        </div>
      </SettingsRow>
    </div>
  </div>
</template>
