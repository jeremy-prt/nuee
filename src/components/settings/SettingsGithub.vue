<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGithubAccount from '@/components/settings/SettingsGithubAccount.vue'
import SettingsGithubLogin from '@/components/settings/SettingsGithubLogin.vue'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsInstall from '@/components/settings/SettingsInstall.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { accountKey, useIntegrationsStore } from '@/stores/integrations'

const { t } = useI18n()
const store = useIntegrationsStore()
if (!store.github) store.load()

const status = computed(() => store.github)
</script>

<template>
  <SettingsGroup :title="t('settings.github.accounts')" :hint="t(store.prefs.github ? 'settings.github.hint' : 'settings.github.offHint')">
    <template #action>
      <UiIconButton :label="t('settings.github.refresh')" :aria-busy="store.checking" :disabled="store.checking" @click="store.load()">
        <RefreshCw class="size-3.5" :class="{ 'animate-spin': store.checking }" aria-hidden="true" />
      </UiIconButton>
    </template>
    <template v-if="status?.state === 'ready'">
      <p v-if="!status.accounts.length" class="border-b border-stroke px-4 py-3 text-xs text-muted">{{ t('settings.github.noAccounts') }}</p>
      <SettingsGithubAccount v-for="(account, index) in status.accounts" :key="`${accountKey(account)}#${index}`" :account="account" />
      <SettingsGithubLogin />
    </template>
    <p v-else class="px-4 py-3 text-xs text-muted" role="status">
      {{ status ? t('settings.github.needsCli') : t('settings.github.checking') }}
    </p>
  </SettingsGroup>

  <SettingsGroup :title="t('settings.github.cli')">
    <SettingsRow data-setting="github-cli" :label="t('settings.github.version')" :hint="t('settings.github.cliHint')">
      <span class="max-w-72 text-end text-xs" aria-live="polite">
        <span v-if="store.error" class="wrap-break-word text-danger">{{ t('settings.github.error', { error: store.error }) }}</span>
        <span v-else-if="!status" class="text-muted">{{ t('settings.github.checking') }}</span>
        <span v-else-if="status.state === 'missing'" class="text-danger">{{ t('settings.install.notInstalled', { tool: 'GitHub CLI' }) }}</span>
        <span v-else-if="status.state === 'outdated'" class="text-danger">{{ t('settings.github.outdated') }}</span>
        <span v-else class="font-mono text-muted">{{ status.version ?? '?' }}</span>
      </span>
    </SettingsRow>
    <SettingsInstall v-if="status?.state === 'missing'" tool="gh" name="GitHub CLI" />
  </SettingsGroup>
</template>
