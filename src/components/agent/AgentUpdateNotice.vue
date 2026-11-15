<script setup lang="ts">
import { Check, X } from '@/components/ui/icons'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import SettingsMcpLogo from '@/components/settings/SettingsMcpLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { DevTool } from '@/ipc/tools'
import { useAgentsStore } from '@/stores/agents'
import { useToolsStore } from '@/stores/tools'
import { agents } from '@/utils/agents'

// Carte « nouvelle version », comme T3 Code et monocode : en haut à droite de la zone centrale, une ligne par agent ou
// outil. Fermée, elle ne revient qu'au prochain lancement (fermeture gardée en mémoire, demande de Jérémy). Les outils
// installés par un gestionnaire que Nuée ne pilote pas (nvm, Corepack…) n'ont qu'un lien vers la version.
const { t } = useI18n()
const store = useAgentsStore()
const tools = useToolsStore()
onMounted(() => void tools.check())

const toolNames: Record<DevTool, { name: string; logo: string }> = {
  gh: { name: 'GitHub CLI', logo: 'github' },
  node: { name: 'Node.js', logo: 'nodejs' },
  pnpm: { name: 'pnpm', logo: 'pnpm' },
}

interface Row {
  key: string
  name: string
  manager: string | null
  agent?: AgentKind
  logo?: string
  version: string | null
  latest: string
  updatable: boolean
  updating: boolean
  done: string | null
  error: string | null
  update: () => Promise<void>
  dismiss: () => void
  open?: () => void
}

async function updateAgent(kind: AgentKind) {
  delete store.notice.results[kind]
  const outcome = await store.update(kind, false)
  store.notice.results[kind] = { version: outcome.updated ? store.status[kind].version : null, error: outcome.updated ? null : outcome.message }
}

const rows = computed<Row[]>(() => {
  const list: Row[] = []
  for (const kind of Object.keys(agents) as AgentKind[]) {
    const status = store.status[kind]
    const result = store.notice.results[kind]
    const done = result?.version ?? null
    if (!done && !(store.settings[kind].enabled && status.state === 'found' && status.latest && store.notice.dismissed[kind] !== status.latest)) continue
    list.push({
      key: kind,
      name: agents[kind].name,
      manager: null,
      agent: kind,
      version: status.version,
      latest: status.latest ?? done ?? '',
      updatable: true,
      updating: status.updating,
      done,
      error: result?.error ?? null,
      update: () => updateAgent(kind),
      dismiss: () => {
        if (status.latest) store.notice.dismissed[kind] = status.latest
        delete store.notice.results[kind]
      },
    })
  }
  for (const item of tools.items) {
    if (!item.done && tools.dismissed[item.tool] === item.latest) continue
    list.push({
      key: item.tool,
      name: toolNames[item.tool].name,
      manager: item.manager,
      logo: toolNames[item.tool].logo,
      version: item.version,
      latest: item.latest,
      updatable: item.updatable,
      updating: item.updating,
      done: item.done,
      error: item.error,
      update: () => tools.update(item.tool),
      dismiss: () => tools.dismiss(item),
      open: () => tools.openRelease(item.tool),
    })
  }
  return list
})

const pending = computed(() => rows.value.filter((row) => row.updatable && !row.done))
const busy = computed(() => rows.value.some((row) => row.updating))

function updateAll() {
  for (const row of pending.value) if (!row.updating) void row.update()
}

function close() {
  for (const row of rows.value) row.dismiss()
}
</script>

<template>
  <section
    v-if="rows.length"
    class="ui-glass absolute end-3 top-3 z-40 w-[min(28rem,calc(100%-1.5rem))] rounded-xl p-3 text-content"
    role="status"
    :aria-label="t('agentUpdate.heading', rows.length)"
  >
    <header class="flex items-center gap-2">
      <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ t('agentUpdate.heading', rows.length) }}</p>
      <UiButton v-if="pending.length > 1" size="xs" variant="ghost" class="-my-1 shrink-0" :disabled="busy" @click="updateAll">
        {{ t('agentUpdate.all') }}
      </UiButton>
      <UiIconButton :label="pending.length ? t('agentUpdate.dismiss') : t('agentUpdate.close')" class="-my-1 -me-1" :disabled="busy" @click="close">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </header>
    <!-- Sous-grille pour aligner versions et boutons d'une ligne à l'autre. -->
    <ul class="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-2 gap-y-2">
      <li v-for="row in rows" :key="row.key" class="col-span-full grid min-h-7 grid-cols-subgrid items-center">
        <SettingsAgentLogo v-if="row.agent" :id="row.agent" small class="shrink-0" />
        <span v-else class="grid size-5 place-items-center"><SettingsMcpLogo :name="row.logo!" /></span>
        <p class="min-w-0 truncate text-[13px] font-medium">
          {{ row.name }}<span v-if="row.manager && !row.done" class="font-normal text-muted"> · {{ row.manager }}</span>
        </p>
        <p v-if="row.done" class="col-span-4 flex items-center justify-end gap-1 text-xs text-success">
          <Check class="size-3.5 shrink-0" aria-hidden="true" />{{ t('agentUpdate.done', { version: row.done }) }}
        </p>
        <template v-else>
          <span class="text-end text-xs text-muted tabular-nums">{{ row.version }}</span>
          <span class="text-xs text-muted" aria-hidden="true">{{ row.version ? '→' : '' }}</span>
          <span class="me-1 text-xs text-muted tabular-nums">{{ row.latest }}</span>
          <UiButton v-if="row.updatable" size="sm" variant="primary" class="w-full" :loading="row.updating" @click="row.update()">
            {{ row.error ? t('agentUpdate.retry') : t('agentUpdate.action') }}
          </UiButton>
          <UiTooltip v-else :label="row.manager ? t('agentUpdate.managedBy', { manager: row.manager }) : t('agentUpdate.manual')">
            <UiButton size="sm" class="w-full" @click="row.open?.()">{{ t('agentUpdate.release') }}</UiButton>
          </UiTooltip>
        </template>
        <p v-if="row.error && !row.done" class="col-span-full col-start-2 line-clamp-2 text-xs text-danger" role="alert" :title="row.error">{{ row.error }}</p>
      </li>
    </ul>
  </section>
</template>
