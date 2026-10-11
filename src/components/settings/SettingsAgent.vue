<script setup lang="ts">
import { CircleCheck, LoaderCircle } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsInstall from '@/components/settings/SettingsInstall.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useRefocus } from '@/composables/useRefocus'
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
// Les quotas bougent à chaque message : relus à chaque ouverture de la page.
if (store.status[props.kind].state === 'found') store.detect(props.kind, true)

const name = agents[props.kind].name
const settings = computed(() => store.settings[props.kind])
const status = computed(() => store.status[props.kind])
const models = computed(() => catalog.get(props.kind)?.models ?? [])
// Valeurs réellement appliquées : un réglage laissé à null montre ce que l'agent choisira.
const resolved = computed(() => catalog.resolve(props.kind, settings.value.defaults))

const quotas = computed(() => {
  const usage = status.value.usage
  if (!usage) return []
  const shared = (['session', 'weekly'] as const).flatMap((key) => {
    const quota = usage[key]
    return quota ? [{ key: key as string, label: t(`settings.agents.${key}`), quota }] : []
  })
  const models = usage.models.map(({ model, quota }) => ({
    key: `weekly-${model}`,
    label: t('settings.agents.weeklyModel', { model }),
    quota,
  }))
  return [...shared, ...models]
})
const account = computed(() => {
  const { email, plan } = status.value.account ?? {}
  return [email, plan].filter(Boolean).join(' · ')
})

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

// Dans moins d'un jour : « dans 2 heures ». Au-delà : le jour et l'heure de la remise à zéro.
function resetsAt(at: number | null) {
  if (at === null) return undefined
  const minutes = Math.max(1, Math.round((at - Date.now()) / 60_000))
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  let when: string
  if (minutes < 60) when = relative.format(minutes, 'minute')
  else if (minutes < 24 * 60) when = relative.format(Math.round(minutes / 60), 'hour')
  else when = new Intl.DateTimeFormat(locale.value, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(at)
  return t('settings.agents.resets', { when })
}

// Le bouton cliqué reste en place, en chargement, le temps de la sonde ; les autres attendent.
const running = ref<'auto' | 'refresh' | 'choose' | 'account' | null>(null)
const refocusAfter = useRefocus()

// Les boutons Automatique, Actualiser et Mettre à jour disparaissent une fois leur action réussie : validés au
// clavier, le focus passe au bouton Choisir/Changer, toujours là.
async function run(event: MouseEvent, action: NonNullable<typeof running.value>, task: () => Promise<unknown>) {
  running.value = action
  try {
    await refocusAfter(event, task, '[data-agent-choose]')
  } finally {
    running.value = null
  }
}

async function choosePath(event: MouseEvent) {
  const path = await pickFile(t('settings.agents.pickTitle', { agent: name }))
  if (path) await run(event, 'choose', () => store.setPath(props.kind, path))
}
</script>

<template>
  <SettingsGroup :title="t('settings.agents.cli')">
    <SettingsRow :data-setting="`${kind}-cli`" :label="t('settings.agents.location')">
      <template #hint>
        <template v-if="status.state === 'checking'">{{ t('settings.agents.checking', { agent: name }) }}</template>
        <span v-else-if="status.state === 'missing'" class="text-danger">{{ t('settings.agents.missing', { agent: name }) }}</span>
        <span v-else-if="status.state === 'error'" class="text-danger">{{ t('settings.agents.error', { agent: name, command: agents[kind].command }) }}</span>
        <template v-else>
          <span class="font-mono break-all">{{ status.path }}</span>
          · {{ settings.path ? t('settings.agents.custom') : t('settings.agents.found') }}
        </template>
      </template>
      <template #default="{ hintId }">
        <LoaderCircle v-if="status.state === 'checking' && !running" class="size-4 animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" />
        <div v-else class="flex flex-wrap justify-end gap-2">
          <UiButton
            v-if="settings.path || running === 'auto'"
            size="sm"
            :loading="running === 'auto'"
            :disabled="!!running"
            @click="run($event, 'auto', () => store.setPath(kind, null))"
          >
            {{ t('settings.agents.auto') }}
          </UiButton>
          <UiButton
            v-if="running === 'refresh' || status.state === 'missing' || status.state === 'error'"
            size="sm"
            :loading="running === 'refresh'"
            :disabled="!!running"
            :aria-describedby="hintId"
            @click="run($event, 'refresh', () => store.refresh(kind))"
          >
            {{ t('settings.agents.refresh') }}
          </UiButton>
          <UiButton size="sm" data-agent-choose :loading="running === 'choose'" :disabled="!!running" :aria-describedby="hintId" @click="choosePath($event)">
            {{ status.path ? t('settings.agents.change') : t('settings.agents.choose') }}
          </UiButton>
        </div>
      </template>
    </SettingsRow>
    <SettingsInstall v-if="status.state === 'missing' && !settings.path" :tool="kind" :name="name" />
    <SettingsRow
      v-if="status.state === 'found'"
      v-slot="{ hintId }"
      :data-setting="`${kind}-version`"
      :label="t('settings.agents.version')"
      :hint="status.latest ? t('settings.agents.updateHint', { version: status.latest }) : t('settings.agents.upToDate')"
    >
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted tabular-nums">{{ status.version }}</span>
        <UiButton v-if="status.latest" size="sm" variant="primary" :loading="status.updating" :aria-describedby="hintId" @click="refocusAfter($event, () => store.update(kind), '[data-agent-choose]')">
          {{ t('settings.agents.update') }}
        </UiButton>
      </div>
    </SettingsRow>
    <SettingsRow
      v-if="status.state === 'found'"
      v-slot="{ hintId }"
      :data-setting="`${kind}-account`"
      :label="t('settings.agents.account')"
      :hint="status.account ? (account ? t('settings.agents.connectedAs', { account }) : undefined) : t('settings.agents.signedOut', { command: agents[kind].command })"
    >
      <span v-if="status.account" class="flex items-center gap-1.5 text-xs text-success">
        <CircleCheck class="size-3.5" aria-hidden="true" />{{ t('settings.agents.status.connected') }}
      </span>
      <UiButton v-else size="sm" :loading="running === 'account'" :aria-describedby="hintId" @click="run($event, 'account', () => store.refresh(kind))">
        {{ t('settings.agents.refresh') }}
      </UiButton>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup v-if="quotas.length" :title="t('settings.agents.usage')">
    <SettingsRow
      v-for="row in quotas"
      :key="row.key"
      :data-setting="`${kind}-${row.key}`"
      :label="row.label"
      :hint="resetsAt(row.quota.resetsAt)"
    >
      <div class="flex items-center gap-3">
        <span class="h-1.5 w-32 overflow-hidden rounded-full bg-content/10" aria-hidden="true">
          <span
            class="block h-full rounded-full"
            :class="row.quota.used >= 0.8 ? 'bg-danger' : 'bg-content/60'"
            :style="{ width: `${row.quota.used * 100}%` }"
          />
        </span>
        <span class="min-w-20 text-end text-xs whitespace-nowrap text-muted tabular-nums">{{ t('settings.agents.used', { percent: percent(row.quota.used) }) }}</span>
      </div>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="t('settings.agents.config', { agent: name })">
    <SettingsRow v-slot="{ hintId }" :data-setting="`${kind}-hooks`" :label="t('settings.agents.hooks')" :hint="t('settings.agents.hooksHint', { agent: name })">
      <UiSwitch v-model="settings.hooks" :label="t('settings.agents.hooks')" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="t('settings.agents.defaults')" :hint="t('settings.agents.defaultsHint', { agent: name })">
    <SettingsRow :data-setting="`${kind}-model`" :label="t('settings.agents.model')" :hint="modelOptions.length ? undefined : t('settings.agents.unavailable', { agent: name })">
      <UiSelect v-if="modelOptions.length" v-model="model" :label="t('settings.agents.model')" :options="modelOptions" />
    </SettingsRow>
    <SettingsRow
      v-if="effortOptions.length"
      :data-setting="`${kind}-effort`"
      :label="t('settings.agents.effort')"
      :hint="t('settings.agents.effortHint', { agent: name })"
    >
      <UiSelect v-model="effort" :label="t('settings.agents.effort')" :options="effortOptions" />
    </SettingsRow>
    <SettingsRow :data-setting="`${kind}-mode`" :label="t('settings.agents.mode')" :hint="t(`composer.mode.${mode}Hint`)">
      <UiSegmented v-model="mode" :label="t('settings.agents.mode')" :options="modes" />
    </SettingsRow>
  </SettingsGroup>
</template>
