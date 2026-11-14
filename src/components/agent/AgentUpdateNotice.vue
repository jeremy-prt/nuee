<script setup lang="ts">
import { Check, X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { agents } from '@/utils/agents'

// Carte « nouvelle version » d'un agent, comme T3 Code et monocode : en haut à droite de la zone centrale, pas du panneau.
// Fermée, elle ne revient qu'au prochain lancement, comme monocode : la fermeture n'est retenue qu'en mémoire (demande de
// Jérémy, une mise à jour ignorée ne doit pas disparaître pour de bon). Mise à jour faite, elle le dit elle-même.
const { t } = useI18n()
const store = useAgentsStore()
const result = computed(() => store.notice.result)

async function update(kind: AgentKind) {
  store.notice.result = null
  const outcome = await store.update(kind, false)
  store.notice.result = { kind, version: outcome.updated ? store.status[kind].version : null, error: outcome.updated ? null : outcome.message }
}

function close() {
  const current = notice.value
  if (current?.status.latest) store.notice.dismissed[current.kind] = current.status.latest
  store.notice.result = null
}

// Un seul agent à la fois : le premier activé qui a une version plus récente, pas encore écartée.
const notice = computed(() => {
  const done = store.notice.result?.version ? store.notice.result : null
  if (done) return { kind: done.kind, status: store.status[done.kind], name: agents[done.kind].name }
  for (const kind of Object.keys(agents) as AgentKind[]) {
    const status = store.status[kind]
    if (store.settings[kind].enabled && status.state === 'found' && status.latest && store.notice.dismissed[kind] !== status.latest) {
      return { kind, status, name: agents[kind].name }
    }
  }
  return null
})
</script>

<template>
  <section
    v-if="notice"
    class="ui-glass absolute end-3 top-3 z-40 w-[min(26rem,calc(100%-1.5rem))] rounded-xl p-3 text-content"
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
        <p class="me-2 shrink-0 text-xs text-muted tabular-nums">{{ notice.status.version ? `${notice.status.version} → ${notice.status.latest}` : notice.status.latest }}</p>
        <UiButton size="sm" variant="primary" class="shrink-0" :loading="notice.status.updating" @click="update(notice.kind)">
          {{ result?.error ? t('agentUpdate.retry') : t('agentUpdate.action') }}
        </UiButton>
      </template>
    </div>
    <p v-if="result?.error && !result.version" class="mt-2 line-clamp-2 text-xs text-danger" role="alert" :title="result.error">{{ result.error }}</p>
  </section>
</template>
