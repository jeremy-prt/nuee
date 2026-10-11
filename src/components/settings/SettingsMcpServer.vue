<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import SettingsSkillsScope from '@/components/settings/SettingsSkillsScope.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useRefocus } from '@/composables/useRefocus'
import { type McpServer, useSkillsStore } from '@/stores/skills'
import { mcpStatus } from '@/utils/mcp'

const props = defineProps<{ name: string }>()

const { t } = useI18n()
const store = useSkillsStore()
const refocusAfter = useRefocus()

if (!store.loaded) store.load()
store.scope = 'nuee'

const server = computed(() => store.findServer(props.name))
const locked = computed(() => !!server.value && store.serverLocked(server.value, store.scope))
const enabled = computed({
  get: () => !!server.value && store.serverOn(server.value, store.scope),
  set: (value: boolean) => server.value && store.setServer(server.value, value, store.scope),
})

const status = computed(() => (server.value ? mcpStatus(server.value, enabled.value, t).text : ''))
const action = computed(() => enabled.value && (server.value?.status === 'needsAuth' || server.value?.status === 'failed'))
const origin = computed(() => {
  return t(`settings.skills.origins.${server.value?.scope === 'plugin' ? 'plugin' : 'config'}`)
})

// Connecté, le bouton disparaît : validé au clavier, le focus passe à l'interrupteur du serveur.
function act(event: MouseEvent, name: string, status: McpServer['status']) {
  refocusAfter(event, () => (status === 'needsAuth' ? store.connect(name) : store.reconnect(name)), '[data-server-enabled]')
}
</script>

<template>
  <p v-if="!server" class="pt-8 text-sm text-muted" :role="store.loaded && !store.checking ? undefined : 'status'">
    {{ store.loaded && !store.checking ? t('settings.skills.serverMissing') : t('settings.skills.loading') }}
  </p>
  <template v-else>
    <SettingsGroup :title="t('settings.skills.behavior')" :hint="t(`settings.skills.scopeHints.${store.scope}`)" :danger="store.scope === 'everywhere'">
      <template #action><SettingsSkillsScope /></template>
      <SettingsRow
        v-slot="{ hintId }"
        :label="t('settings.skills.enabled')"
        :hint="locked ? t('settings.skills.lockedHint') : t('settings.skills.serverEnabledHint')"
      >
        <UiSwitch v-model="enabled" data-server-enabled :disabled="locked || store.pending.has(server.name)" :label="t('settings.skills.enabled')" :aria-describedby="hintId" />
      </SettingsRow>
      <SettingsRow :label="t('settings.skills.state')">
        <template #hint>
          <span :class="{ 'text-danger': enabled && server.status === 'failed' }">{{ status }}</span>
        </template>
        <template #default="{ hintId }">
          <div v-if="action" class="flex items-center gap-1">
            <UiIconButton v-if="store.logins.has(server.name)" :label="t('settings.skills.cancelConnect', { name: server.name })" @click="store.connect(server.name)">
              <X class="size-3.5" aria-hidden="true" />
            </UiIconButton>
            <UiButton
              size="sm"
              :loading="store.pending.has(server.name)"
              :aria-describedby="hintId"
              @click="act($event, server.name, server.status)"
            >
              {{ server.status === 'needsAuth' ? t('settings.skills.connect') : t('settings.skills.reconnect') }}
            </UiButton>
          </div>
        </template>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup :title="t('settings.skills.details')">
      <SettingsRow :label="t('settings.skills.origin')" :hint="origin" />
      <SettingsRow v-if="server.transport" :label="t('settings.skills.transport')" :hint="server.transport" />
      <SettingsRow v-if="server.target" :label="t('settings.skills.target')">
        <template #hint><span class="font-mono break-all select-text">{{ server.target }}</span></template>
      </SettingsRow>
    </SettingsGroup>
  </template>
</template>
