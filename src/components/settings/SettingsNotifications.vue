<script setup lang="ts">
import { Volume2 } from '@/components/ui/icons'
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
const needed = computed(() => general.notifications && (general.systemNotifications || (dock && general.dockBadge)))
const off = computed(() => !general.notifications)
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
      v-slot="{ hintId }"
      data-setting="notifications"
      :label="t('settings.general.notifications.enabled')"
      :hint="t('settings.general.notifications.enabledHint')"
    >
      <UiSwitch v-model="general.notifications" :label="t('settings.general.notifications.enabled')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow
      v-slot="{ hintId }"
      data-setting="systemNotifications"
      :disabled="off"
      :label="t('settings.general.notifications.system')"
      :hint="t('settings.general.notifications.systemHint')"
    >
      <UiSwitch v-model="general.systemNotifications" :disabled="off" :label="t('settings.general.notifications.system')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="appNotifications" :disabled="off" :label="t('settings.general.notifications.app')" :hint="t('settings.general.notifications.appHint')">
      <UiSwitch v-model="general.appNotifications" :disabled="off" :label="t('settings.general.notifications.app')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="sounds" :disabled="off" :label="t('settings.general.notifications.sounds')" :hint="t('settings.general.notifications.soundsHint')">
      <div class="flex items-center gap-3">
        <UiIconButton :label="t('settings.general.notifications.preview')" :disabled="off" @click="playCue('done')">
          <Volume2 class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiSwitch v-model="general.sounds" :disabled="off" :label="t('settings.general.notifications.sounds')" :aria-describedby="hintId" />
      </div>
    </SettingsRow>
    <SettingsRow
      v-if="dock"
      v-slot="{ hintId }"
      data-setting="bounce"
      :disabled="off"
      :label="t('settings.general.notifications.bounce')"
      :hint="t('settings.general.notifications.bounceHint')"
    >
      <UiSwitch v-model="general.dockBounce" :disabled="off" :label="t('settings.general.notifications.bounce')" :aria-describedby="hintId" />
    </SettingsRow>
    <SettingsRow
      v-if="dock"
      v-slot="{ hintId }"
      data-setting="badge"
      :disabled="off"
      :label="t('settings.general.notifications.badge')"
      :hint="t('settings.general.notifications.badgeHint')"
    >
      <UiSwitch v-model="general.dockBadge" :disabled="off" :label="t('settings.general.notifications.badge')" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>
</template>
