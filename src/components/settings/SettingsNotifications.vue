<script setup lang="ts">
import { Volume2 } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import type { NotificationPermission } from '@/ipc/bindings/NotificationPermission'
import { notificationOpenSettings, notificationPermission } from '@/ipc/notification'
import { isMacosApp, isTauriApp } from '@/ipc/system'
import { onWindowFocus } from '@/ipc/window'
import { useGeneralStore } from '@/stores/general'
import { playCue } from '@/utils/sounds'

const { t } = useI18n()
const general = useGeneralStore()
// La pastille passe par le Dock : ailleurs, setBadgeCount n'a pas d'équivalent fiable.
const dock = isMacosApp()

// Relue au retour dans l'app : on vient peut-être de l'autoriser dans les réglages de macOS.
const permission = ref<NotificationPermission | null>(null)
const needed = computed(() => general.systemNotifications || (dock && general.dockBadge))
let stopFocus: (() => void) | null = null
let unmounted = false

async function loadPermission() {
  permission.value = await notificationPermission().catch(() => null)
}

onMounted(() => {
  if (!isTauriApp()) return
  loadPermission()
  onWindowFocus((focused) => focused && loadPermission()).then((stop) => {
    if (unmounted) stop()
    else stopFocus = stop
  })
})
onUnmounted(() => {
  unmounted = true
  stopFocus?.()
})
</script>

<template>
  <SettingsGroup :title="t('settings.general.notifications.title')">
    <SettingsRow
      v-if="needed && permission === 'denied'"
      :label="t('settings.general.notifications.blocked')"
      :hint="t('settings.general.notifications.blockedHint')"
    >
      <UiButton size="sm" @click="notificationOpenSettings()">{{ t('settings.general.notifications.openSettings') }}</UiButton>
    </SettingsRow>
    <SettingsRow
      v-else-if="needed && permission === 'unavailable'"
      :label="t('settings.general.notifications.devOnly')"
      :hint="t('settings.general.notifications.devOnlyHint')"
    />
    <SettingsRow
      v-slot="{ hintId }"
      :label="t('settings.general.notifications.system')"
      :hint="t('settings.general.notifications.systemHint')"
    >
      <UiSwitch v-model="general.systemNotifications" :label="t('settings.general.notifications.system')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" :label="t('settings.general.notifications.app')" :hint="t('settings.general.notifications.appHint')">
      <UiSwitch v-model="general.appNotifications" :label="t('settings.general.notifications.app')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" :label="t('settings.general.notifications.sounds')" :hint="t('settings.general.notifications.soundsHint')">
      <div class="flex items-center gap-3">
        <UiIconButton :label="t('settings.general.notifications.preview')" @click="playCue('done')">
          <Volume2 class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiSwitch v-model="general.sounds" :label="t('settings.general.notifications.sounds')" :aria-describedby="hintId" />
      </div>
    </SettingsRow>
    <SettingsRow
      v-if="dock"
      v-slot="{ hintId }"
      :label="t('settings.general.notifications.badge')"
      :hint="t('settings.general.notifications.badgeHint')"
    >
      <UiSwitch v-model="general.dockBadge" :label="t('settings.general.notifications.badge')" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>
</template>
