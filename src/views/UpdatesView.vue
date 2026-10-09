<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import { appVersion, openReleasePage } from '@/ipc/system'

const { t } = useI18n()
const { status, latest, check } = useUpdateCheck()
const version = ref('')

onMounted(async () => {
  version.value = await appVersion().catch(() => '')
})
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
    <RefreshCw class="size-8 text-muted" aria-hidden="true" />
    <h2 class="text-lg font-semibold">{{ t('rail.updates') }}</h2>
    <p class="text-sm text-muted">{{ t('updates.installed', { version }) }}</p>
    <button
      type="button"
      class="h-9 rounded-md border border-stroke px-4 text-sm hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
      :disabled="status === 'checking'"
      @click="check()"
    >
      {{ status === 'checking' ? t('updates.checking') : t('updates.check') }}
    </button>
    <div aria-live="polite" class="min-h-10 text-sm text-muted">
      <p v-if="status === 'upToDate'">{{ t('updates.upToDate') }}</p>
      <p v-else-if="status === 'failed'">{{ t('updates.failed') }}</p>
      <template v-else-if="status === 'available' && latest">
        <p class="text-content">{{ t('updates.available', { version: latest.version }) }}</p>
        <button
          type="button"
          class="mt-1 text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          @click="openReleasePage(latest.url)"
        >
          {{ t('updates.view') }}
        </button>
      </template>
    </div>
  </div>
</template>
