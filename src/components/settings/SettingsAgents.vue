<script setup lang="ts">
import { CircleCheck, Download, LoaderCircle, RefreshCw, SlidersHorizontal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { useNavigationStore } from '@/stores/navigation'
import { agents, upcomingAgents } from '@/utils/agents'

const { t } = useI18n()
const store = useAgentsStore()
const navigation = useNavigationStore()
const kinds = Object.keys(agents) as AgentKind[]

// Une action à la fois à côté des réglages : mettre à jour, ou revérifier quand l'agent est introuvable ou déconnecté.
function action(kind: AgentKind) {
  const current = store.status[kind]
  if (!store.settings[kind].enabled) return null
  if (current.latest) {
    const label = current.updating
      ? t('settings.agents.updating', { version: current.latest })
      : t('settings.agents.updateTo', { version: current.latest })
    return { label, icon: current.updating ? LoaderCircle : Download, tone: 'text-info', run: () => store.update(kind) }
  }
  if (current.state === 'missing') return { label: t('settings.agents.retry'), icon: RefreshCw, tone: '', run: () => store.detect(kind) }
  if (current.state === 'found' && !current.account) {
    return { label: t('settings.agents.recheck'), icon: RefreshCw, tone: '', run: () => store.detect(kind) }
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
          <template v-if="!store.settings[kind].enabled">{{ t('settings.agents.status.off') }}</template>
          <template v-else-if="store.status[kind].state === 'checking'">{{ t('settings.agents.status.checking') }}</template>
          <span v-else-if="store.status[kind].state === 'missing'" class="text-danger">{{ t('settings.agents.status.missing') }}</span>
          <template v-else>
            <span v-if="store.status[kind].account" class="inline-flex items-center gap-1">
              <CircleCheck class="size-3 text-success" aria-hidden="true" />{{ t('settings.agents.status.connected') }}
            </span>
            <span v-else class="text-danger">{{ t('settings.agents.status.signedOut') }}</span>
            · {{ t('settings.agents.versionShort', { version: store.status[kind].version }) }}
          </template>
        </template>
        <div class="flex items-center gap-1">
          <UiIconButton
            v-if="action(kind)"
            :label="action(kind)!.label"
            :disabled="store.status[kind].updating"
            @click="action(kind)!.run()"
          >
            <component
              :is="action(kind)!.icon"
              class="size-4"
              :class="store.status[kind].updating ? 'animate-spin' : action(kind)!.tone"
              aria-hidden="true"
            />
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
