<script setup lang="ts">
import { CircleCheck, Download, ExternalLink, RefreshCw, SlidersHorizontal } from '@/components/ui/icons'
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useInstallPage } from '@/composables/useInstallPage'
import { useRefocus } from '@/composables/useRefocus'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { useNavigationStore } from '@/stores/navigation'
import { agents, upcomingAgents } from '@/utils/agents'

const { t } = useI18n()
const store = useAgentsStore()
const navigation = useNavigationStore()
const openInstall = useInstallPage()
const refocusAfter = useRefocus()
const kinds = Object.keys(agents) as AgentKind[]
// Agents actualisés depuis cette page : leur bouton reste en place, en chargement, le temps de la sonde.
const refreshing = reactive(new Set<AgentKind>())

// Pas avec un chemin choisi à la main : il resterait prioritaire sur l'agent installé.
function installable(kind: AgentKind) {
  const settings = store.settings[kind]
  return settings.enabled && !settings.path && store.status[kind].state === 'missing'
}

async function refresh(kind: AgentKind) {
  refreshing.add(kind)
  try {
    await store.refresh(kind)
  } finally {
    refreshing.delete(kind)
  }
}

// Une action à la fois à côté des réglages : mettre à jour, ou actualiser quand l'agent est introuvable ou déconnecté.
function action(kind: AgentKind) {
  const current = store.status[kind]
  if (!store.settings[kind].enabled) return null
  if (current.latest) {
    const label = current.updating
      ? t('settings.agents.updating', { version: current.latest })
      : t('settings.agents.updateTo', { version: current.latest })
    return { label, icon: Download, tone: 'text-signal-text', loading: current.updating, run: () => store.update(kind) }
  }
  if (refreshing.has(kind) || current.state === 'missing' || current.state === 'error' || (current.state === 'found' && !current.account)) {
    const label = t('settings.agents.refreshAgent', { agent: agents[kind].name })
    return { label, icon: RefreshCw, tone: '', loading: refreshing.has(kind), run: () => refresh(kind) }
  }
  return null
}
</script>

<template>
  <div data-setting="agents" class="flex flex-col gap-3 pt-8">
    <div v-for="kind in kinds" :key="kind" class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <SettingsRow :label="agents[kind].name">
        <template #icon><SettingsAgentLogo :id="kind" :muted="!store.settings[kind].enabled" /></template>
        <template #hint>
          <span aria-live="polite">
            <template v-if="!store.settings[kind].enabled">{{ t('settings.agents.status.off') }}</template>
            <template v-else-if="store.status[kind].state === 'checking'">{{ t('settings.agents.status.checking') }}</template>
            <span v-else-if="store.status[kind].state === 'missing'" class="text-danger">{{ t('settings.install.notInstalled', { tool: agents[kind].name }) }}</span>
            <span v-else-if="store.status[kind].state === 'error'" class="text-danger">{{ t('settings.agents.status.error') }}</span>
            <template v-else>
              <span v-if="store.status[kind].account" class="inline-flex items-center gap-1">
                <CircleCheck class="size-3 text-success" aria-hidden="true" />{{ t('settings.agents.status.connected') }}
              </span>
              <span v-else class="text-danger">{{ t('settings.agents.status.signedOut') }}</span>
              · {{ t('settings.agents.versionShort', { version: store.status[kind].version }) }}
            </template>
          </span>
        </template>
        <div class="flex items-center gap-1">
          <UiButton v-if="installable(kind)" size="sm" class="me-1" :aria-label="t('settings.install.installTool', { tool: agents[kind].name })" @click="openInstall(kind)">
            <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('settings.install.install') }}
          </UiButton>
          <UiIconButton v-if="action(kind)" :label="action(kind)!.label" :loading="action(kind)!.loading" @click="refocusAfter($event, () => action(kind)!.run(), `[data-customize='${kind}']`)">
            <component :is="action(kind)!.icon" class="size-3.5" :class="action(kind)!.tone" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton
            :label="t('settings.agents.configure', { agent: agents[kind].name })"
            :data-customize="kind"
            @click="navigation.showSettingsDetail(kind)"
          >
            <SlidersHorizontal class="size-3.5" aria-hidden="true" />
          </UiIconButton>
          <UiSwitch v-model="store.settings[kind].enabled" class="ms-1" :label="t('settings.agents.use', { agent: agents[kind].name })" />
        </div>
      </SettingsRow>
    </div>

    <div v-for="agent in upcomingAgents" :key="agent.id" class="overflow-hidden rounded-xl border border-stroke bg-content/3 opacity-50">
      <SettingsRow :label="agent.name" :hint="t('settings.agents.soon')">
        <template #icon><SettingsAgentLogo :id="agent.id" /></template>
      </SettingsRow>
    </div>
  </div>
</template>
