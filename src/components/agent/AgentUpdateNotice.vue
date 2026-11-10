<script setup lang="ts">
import { Check, X } from '@/components/ui/icons'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { agents } from '@/utils/agents'

// Carte « nouvelle version » d'un agent, comme T3 Code et monocode : en haut à droite (les messages occupent le bas),
// fermée pour cette version seulement ; la suivante la fait revenir. Mise à jour faite, elle le dit elle-même (comme
// monocode) jusqu'à ce qu'on la ferme.
const STORAGE_KEY = 'nuee.agentUpdates.dismissed.v1'

const { t } = useI18n()
const store = useAgentsStore()

function load(): Partial<Record<AgentKind, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
const dismissed = reactive(load())
watch(dismissed, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
  } catch {
    // Stockage refusé : la carte reviendra au prochain lancement.
  }
})

// Résultat de la dernière mise à jour lancée ici : la carte reste pour l'annoncer, ou montrer l'erreur.
const result = ref<{ kind: AgentKind; version: string | null; error: string | null } | null>(null)

async function update(kind: AgentKind) {
  result.value = null
  const outcome = await store.update(kind, false)
  result.value = { kind, version: outcome.updated ? store.status[kind].version : null, error: outcome.updated ? null : outcome.message }
}

function close() {
  const current = notice.value
  if (current?.status.latest) dismissed[current.kind] = current.status.latest
  result.value = null
}

// Un seul agent à la fois : le premier activé qui a une version plus récente, pas encore écartée.
const notice = computed(() => {
  const done = result.value?.version ? result.value : null
  if (done) return { kind: done.kind, status: store.status[done.kind], name: agents[done.kind].name }
  for (const kind of Object.keys(agents) as AgentKind[]) {
    const status = store.status[kind]
    if (store.settings[kind].enabled && status.state === 'found' && status.latest && dismissed[kind] !== status.latest) {
      return { kind, status, name: agents[kind].name }
    }
  }
  return null
})
</script>

<template>
  <section
    v-if="notice"
    class="ui-glass fixed end-4 top-14 z-40 w-[min(26rem,calc(100%-2rem))] rounded-xl p-3 text-content"
    role="status"
    :aria-label="t('agentUpdate.title', { agent: notice.name })"
  >
    <header class="flex items-center gap-2">
      <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ t('agentUpdate.heading') }}</p>
      <UiIconButton :label="result?.version ? t('agentUpdate.close') : t('agentUpdate.dismiss')" class="-my-1 -me-1" :disabled="notice.status.updating" @click="close">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </header>
    <div class="mt-2.5 flex min-h-7 items-center gap-2">
      <SettingsAgentLogo :id="notice.kind" small class="shrink-0" />
      <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ notice.name }}</p>
      <p v-if="result?.version" class="flex shrink-0 items-center gap-1 text-xs text-success">
        <Check class="size-3.5 shrink-0" aria-hidden="true" />{{ t('agentUpdate.done', { version: result.version }) }}
      </p>
      <template v-else>
        <p class="me-2 shrink-0 font-mono text-xs text-muted">{{ notice.status.version ? `${notice.status.version} → ${notice.status.latest}` : notice.status.latest }}</p>
        <UiButton size="sm" variant="primary" class="shrink-0" :loading="notice.status.updating" @click="update(notice.kind)">
          {{ result?.error ? t('agentUpdate.retry') : t('agentUpdate.action') }}
        </UiButton>
      </template>
    </div>
    <p v-if="result?.error && !result.version" class="mt-2 line-clamp-2 text-xs text-danger" role="alert" :title="result.error">{{ result.error }}</p>
  </section>
</template>
