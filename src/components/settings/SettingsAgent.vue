<script setup lang="ts">
import { CircleCheck, LoaderCircle } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import { pickFile } from '@/ipc/dialog'
import { useAgentsStore } from '@/stores/agents'
import { useCatalogStore } from '@/stores/catalog'
import { agents } from '@/utils/agents'

const props = defineProps<{ kind: AgentKind }>()

const { t, locale } = useI18n()
const store = useAgentsStore()
const catalog = useCatalogStore()
catalog.load(props.kind)

const name = agents[props.kind].name
const settings = computed(() => store.settings[props.kind])
const status = computed(() => store.status[props.kind])
const models = computed(() => catalog.get(props.kind)?.models ?? [])
// Valeurs réellement appliquées : un réglage laissé à null montre ce que l'agent choisira.
const resolved = computed(() => catalog.resolve(props.kind, settings.value.defaults))

const modelOptions = computed(() => models.value.map((model) => ({ value: model.value, label: model.label })))
const effortOptions = computed(() =>
  (models.value.find((model) => model.value === resolved.value.model)?.efforts ?? []).map((effort) => ({
    value: effort,
    label: t(`composer.effort.${effort}`),
  })),
)
const modes = computed(() => (['bypass', 'auto'] as const).map((mode) => ({ value: mode, label: t(`composer.mode.${mode}`) })))

const model = computed({
  get: () => resolved.value.model ?? '',
  set: (value: string) => (settings.value.defaults.model = value),
})
const effort = computed({
  get: () => resolved.value.effort ?? '',
  set: (value: string) => (settings.value.defaults.effort = value as Effort),
})
const mode = computed({
  get: () => settings.value.defaults.mode,
  set: (value: PermissionMode) => (settings.value.defaults.mode = value),
})

function percent(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'percent' }).format(value)
}

// Session : « dans 2 heures ». Semaine : le jour et l'heure de la remise à zéro.
function resetsAt(quota: 'session' | 'weekly') {
  const at = status.value.usage?.[quota].resetsAt ?? Date.now()
  if (quota === 'weekly') {
    return new Intl.DateTimeFormat(locale.value, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(at)
  }
  const minutes = Math.max(1, Math.round((at - Date.now()) / 60_000))
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  return minutes < 60 ? relative.format(minutes, 'minute') : relative.format(Math.round(minutes / 60), 'hour')
}

async function choosePath() {
  const path = await pickFile(t('settings.agents.pickTitle', { agent: name }))
  if (path) store.setPath(props.kind, path)
}
</script>

<template>
  <SettingsGroup :title="t('settings.agents.cli')">
    <SettingsRow :data-setting="`${kind}-cli`" :label="t('settings.agents.location')">
      <template #hint>
        <template v-if="status.state === 'checking'">{{ t('settings.agents.checking', { agent: name }) }}</template>
        <span v-else-if="status.state === 'missing'" class="text-danger">{{ t('settings.agents.missing', { agent: name }) }}</span>
        <template v-else>
          <span class="font-mono break-all">{{ status.path }}</span>
          · {{ settings.path ? t('settings.agents.custom') : t('settings.agents.found') }}
        </template>
      </template>
      <template #default="{ hintId }">
        <LoaderCircle v-if="status.state === 'checking'" class="size-4 animate-spin text-muted" aria-hidden="true" />
        <div v-else class="flex flex-wrap justify-end gap-2">
          <UiButton v-if="settings.path" size="sm" variant="ghost" @click="store.setPath(kind, null)">{{ t('settings.agents.auto') }}</UiButton>
          <UiButton v-if="status.state === 'missing'" size="sm" :aria-describedby="hintId" @click="store.detect(kind)">
            {{ t('settings.agents.retry') }}
          </UiButton>
          <UiButton size="sm" :aria-describedby="hintId" @click="choosePath()">
            {{ status.state === 'missing' ? t('settings.agents.choose') : t('settings.agents.change') }}
          </UiButton>
        </div>
      </template>
    </SettingsRow>
    <SettingsRow
      v-if="status.state === 'found'"
      v-slot="{ hintId }"
      :data-setting="`${kind}-version`"
      :label="t('settings.agents.version')"
      :hint="status.latest ? t('settings.agents.updateHint', { version: status.latest }) : t('settings.agents.upToDate')"
    >
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted tabular-nums">{{ status.version }}</span>
        <UiButton v-if="status.latest" size="xs" variant="primary" :loading="status.updating" :aria-describedby="hintId" @click="store.update(kind)">
          {{ t('settings.agents.update') }}
        </UiButton>
      </div>
    </SettingsRow>
    <SettingsRow
      v-if="status.state === 'found'"
      v-slot="{ hintId }"
      :data-setting="`${kind}-account`"
      :label="t('settings.agents.account')"
      :hint="status.account ? t('settings.agents.connectedAs', { account: status.account }) : t('settings.agents.signedOut', { command: agents[kind].command })"
    >
      <span v-if="status.account" class="flex items-center gap-1.5 text-xs text-success">
        <CircleCheck class="size-3.5" aria-hidden="true" />{{ t('settings.agents.status.connected') }}
      </span>
      <UiButton v-else size="sm" :aria-describedby="hintId" @click="store.detect(kind)">{{ t('settings.agents.recheck') }}</UiButton>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup v-if="status.usage" :title="t('settings.agents.usage')">
    <SettingsRow
      v-for="quota in (['session', 'weekly'] as const)"
      :key="quota"
      :data-setting="`${kind}-${quota}`"
      :label="t(`settings.agents.${quota}`)"
      :hint="t('settings.agents.resets', { when: resetsAt(quota) })"
    >
      <div class="flex items-center gap-3">
        <span class="h-1.5 w-32 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
          <span
            class="block h-full rounded-full"
            :class="status.usage[quota].used >= 0.8 ? 'bg-danger' : 'bg-content/60'"
            :style="{ width: `${status.usage[quota].used * 100}%` }"
          />
        </span>
        <span class="min-w-20 text-end text-xs whitespace-nowrap text-muted tabular-nums">{{ t('settings.agents.used', { percent: percent(status.usage[quota].used) }) }}</span>
      </div>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="t('settings.agents.defaults')" :hint="t('settings.agents.defaultsHint', { agent: name })">
    <SettingsRow :data-setting="`${kind}-model`" :label="t('settings.agents.model')" :hint="modelOptions.length ? undefined : t('settings.agents.unavailable', { agent: name })">
      <UiSelect v-if="modelOptions.length" v-model="model" :label="t('settings.agents.model')" :options="modelOptions" variant="field" side="bottom" />
    </SettingsRow>
    <SettingsRow
      v-if="effortOptions.length"
      :data-setting="`${kind}-effort`"
      :label="t('settings.agents.effort')"
      :hint="t('settings.agents.effortHint', { agent: name })"
    >
      <UiSelect v-model="effort" :label="t('settings.agents.effort')" :options="effortOptions" variant="field" side="bottom" />
    </SettingsRow>
    <SettingsRow :data-setting="`${kind}-mode`" :label="t('settings.agents.mode')" :hint="t(`composer.mode.${mode}Hint`)">
      <UiSegmented v-model="mode" :label="t('settings.agents.mode')" :options="modes" />
    </SettingsRow>
  </SettingsGroup>
</template>
