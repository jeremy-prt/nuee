<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGithubAvatar from '@/components/settings/SettingsGithubAvatar.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { type GithubAccount, useIntegrationsStore } from '@/stores/integrations'

const props = defineProps<{ account: GithubAccount }>()

const { t } = useI18n()
const store = useIntegrationsStore()
const hintId = useId()
const name = computed(() => props.account.login || t('settings.github.unknownLogin'))

const problem = computed(() => {
  const { state, error, host } = props.account
  if (state === 'timeout') return t('settings.github.timeout', { host })
  if (state === 'failed') return error ?? t('settings.github.failed')
  return null
})
</script>

<template>
  <div data-setting-row class="flex items-center gap-3 border-b border-stroke px-4 py-2.5">
    <SettingsGithubAvatar :account="account" />
    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
        <span class="truncate">{{ name }}</span>
        <span v-if="account.active" class="shrink-0 rounded bg-content/8 px-1.5 py-px text-[11px] font-normal text-muted">
          {{ t('settings.github.active') }}
        </span>
      </p>
      <p :id="hintId" class="mt-0.5 text-xs/relaxed text-muted">
        {{ account.host }}
        <span v-if="problem" class="line-clamp-2 wrap-break-word text-danger">{{ problem }}</span>
        <span v-if="account.envVar" class="block text-info">{{ t('settings.github.envToken', { name: account.envVar }) }}</span>
      </p>
    </div>
    <UiSwitch
      :model-value="store.used(account)"
      :disabled="!store.prefs.github"
      :label="t('settings.github.use', { login: name })"
      :aria-describedby="hintId"
      @update:model-value="store.setUsed(account, $event)"
    />
  </div>
</template>
