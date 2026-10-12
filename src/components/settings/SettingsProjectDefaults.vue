<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useResetToast } from '@/composables/useResetToast'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import { useCatalogStore } from '@/stores/catalog'
import { type MuteKind, useProjectsStore } from '@/stores/projects'
import { agents } from '@/utils/agents'

// Réglages d'un projet qu'on change souvent : sur la page Projets et en tête de la sous-page du projet.
const props = defineProps<{ id: string }>()

const { t, locale } = useI18n()
const projects = useProjectsStore()
const catalog = useCatalogStore()
const resetToast = useResetToast()

const project = computed(() => projects.byId(props.id))

// Le dossier a pu devenir (ou cesser d'être) un dépôt git depuis la dernière lecture.
watch(project, (current) => current && projects.checkWorktree(current), { immediate: true })

const agent = computed({
  get: () => projects.chatAgent(props.id),
  set: (value: AgentKind) => {
    const current = project.value
    if (!current || value === agent.value) return
    // Modèles et efforts appartiennent à un agent : ceux de l'ancien ne valent plus.
    Object.assign(current, { agent: value, model: null, effort: null })
  },
})
watch(agent, (kind) => catalog.load(kind), { immediate: true })

// Toujours une valeur réelle : ce que le projet a choisi, sinon ce que Réglages › Agents enverra.
const resolved = computed(() => catalog.resolve(agent.value, projects.chatOptions(props.id, agent.value)))
const models = computed(() => catalog.get(agent.value)?.models ?? [])
const agentOptions = (Object.keys(agents) as AgentKind[]).map((kind) => ({ value: kind, label: agents[kind].name }))
const modelOptions = computed(() => models.value.map((model) => ({ value: model.value, label: model.label })))
const effortOptions = computed(() =>
  (models.value.find((model) => model.value === resolved.value.model)?.efforts ?? []).map((effort) => ({
    value: effort,
    label: t(`composer.effort.${effort}`),
  })),
)
const model = computed({
  get: () => resolved.value.model ?? '',
  set: (value: string) => project.value && (project.value.model = value),
})
const effort = computed({
  get: () => resolved.value.effort ?? '',
  set: (value: string) => project.value && (project.value.effort = value as Effort),
})
const chosen = computed(() => !!project.value && (project.value.agent !== null || project.value.model !== null || project.value.effort !== null))

function resetDefaults(event: MouseEvent) {
  if (!project.value) return
  Object.assign(project.value, { agent: null, model: null, effort: null })
  resetToast('section')
  // Le bouton disparaît avec ce qu'il rétablissait.
  if (event.detail === 0) document.querySelector<HTMLElement>('[data-setting="project-agent"] button')?.focus()
}

// Absente tant que git n'a pas répondu (ou hors de l'app) : rien n'est bloqué d'avance.
const support = computed(() => projects.support[props.id])
const worktreeReady = computed(() => support.value === undefined || support.value === 'ready')
const worktree = computed({
  get: () => !!project.value?.worktree && worktreeReady.value,
  set: (value: boolean) => project.value && (project.value.worktree = value),
})
const worktreeHint = computed(() =>
  worktreeReady.value ? t('settings.projects.worktreeHint') : t(`settings.projects.worktreeSupport.${support.value}`),
)

const muted = computed(() => (project.value && projects.isMuted(project.value.id) ? project.value.muted : null))
const muteOptions = computed(() => (['on', 'hour', 'tomorrow', 'always'] as const).map((value) => ({ value, label: t(`settings.projects.mute.${value}`) })))
const mute = computed({
  get: () => muted.value?.kind ?? 'on',
  set: (value: MuteKind | 'on') => project.value && projects.mute(project.value, value === 'on' ? null : value),
})
const muteHint = computed(() => {
  const until = muted.value?.until
  if (!muted.value) return t('settings.projects.muteHints.on')
  if (until === null || until === undefined) return t('settings.projects.muteHints.always')
  const sameDay = new Date(until).toDateString() === new Date(projects.now).toDateString()
  const time = new Intl.DateTimeFormat(locale.value, sameDay ? { timeStyle: 'short' } : { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(until)
  return t('settings.projects.muteHints.until', { time })
})
</script>

<template>
  <SettingsGroup :title="t('settings.projects.defaults')" :hint="t('settings.projects.defaultsHint')">
    <!-- Toujours en place, masqué : son apparition ne décale pas le groupe. -->
    <template #action><SettingsResetButton :class="{ invisible: !chosen }" @click="resetDefaults($event)" /></template>
    <SettingsRow data-setting="project-agent" :label="t('settings.projects.agent')">
      <UiSelect v-model="agent" :label="t('settings.projects.agent')" :options="agentOptions" />
    </SettingsRow>
    <SettingsRow
      data-setting="project-model"
      :label="t('settings.projects.model')"
      :hint="modelOptions.length ? undefined : t('settings.agents.unavailable', { agent: agents[agent].name })"
    >
      <UiSelect v-if="modelOptions.length" v-model="model" :label="t('settings.projects.model')" :options="modelOptions" />
    </SettingsRow>
    <SettingsRow v-if="effortOptions.length" data-setting="project-effort" :label="t('settings.projects.effort')">
      <UiSelect v-model="effort" :label="t('settings.projects.effort')" :options="effortOptions" />
    </SettingsRow>
    <SettingsRow v-slot="{ hintId }" data-setting="project-worktree" :label="t('settings.projects.worktree')" :hint="worktreeHint" :disabled="!worktreeReady">
      <UiSwitch v-model="worktree" :label="t('settings.projects.worktree')" :disabled="!worktreeReady" :aria-describedby="hintId" />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow data-setting="project-mute" :label="t('settings.projects.notifications')" :hint="muteHint">
      <UiSelect v-model="mute" :label="t('settings.projects.notifications')" :options="muteOptions" />
    </SettingsRow>
  </SettingsGroup>
</template>
