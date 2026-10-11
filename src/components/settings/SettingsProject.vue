<script setup lang="ts">
import { Check, Copy, FolderOpen, SlidersHorizontal } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsProjectIcon from '@/components/settings/SettingsProjectIcon.vue'
import SettingsResetButton from '@/components/settings/SettingsResetButton.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useResetToast } from '@/composables/useResetToast'
import { isAppError } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Effort } from '@/ipc/bindings/Effort'
import { projectReveal } from '@/ipc/project'
import { isMacosApp } from '@/ipc/system'
import { useCatalogStore } from '@/stores/catalog'
import { useDialogStore } from '@/stores/dialog'
import { useNavigationStore } from '@/stores/navigation'
import { type MuteKind, useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { agents } from '@/utils/agents'

const props = defineProps<{ id: string }>()

const { t, locale } = useI18n()
const projects = useProjectsStore()
const catalog = useCatalogStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const dialog = useDialogStore()
const resetToast = useResetToast()
const toasts = useToastsStore()

const project = computed(() => projects.byId(props.id))

// Le dossier a pu changer depuis la dernière lecture : icône et dépôt git relus à chaque ouverture.
watch(
  project,
  (current) => {
    if (!current) return
    projects.loadIcon(current, true)
    projects.checkWorktree(current)
  },
  { immediate: true },
)

const draft = ref(project.value?.name ?? '')
watch(() => project.value?.name, (name) => (draft.value = name ?? ''))

function commitName() {
  if (project.value) projects.rename(project.value, draft.value)
  draft.value = project.value?.name ?? ''
}

// Échap annule une saisie en cours ; sans saisie, il garde son rôle (revenir à la liste).
function onNameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') commitName()
  if (event.key !== 'Escape' || draft.value === project.value?.name) return
  event.stopPropagation()
  draft.value = project.value?.name ?? ''
}

const revealLabel = isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder'
const copied = ref(false)

async function copyPath() {
  if (!project.value) return
  try {
    await navigator.clipboard.writeText(project.value.path)
  } catch {
    return
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function reveal() {
  if (!project.value) return
  try {
    await projectReveal(project.value.path)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.revealFailed'), body: isAppError(error) ? error.message : String(error) })
  }
}

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
watch(support, (value) => value === 'ready' && project.value && worktrees.load(project.value), { immediate: true })
const worktreeCount = computed(() => worktrees.lists[props.id]?.filter((tree) => !tree.main).length ?? 0)

const worktreeHint = computed(() =>
  worktreeReady.value ? t('settings.projects.worktreeHint') : t(`settings.projects.worktreeSupport.${support.value}`),
)

// Toutes les lignes du projet, archivées comprises ; un onglet jamais servi n'est pas un chat.
const projectChats = computed(() => workspace.tabsFor(props.id).filter((tab) => tab.started))
const activeChats = computed(() => projectChats.value.filter((tab) => !tab.archived).length)

// Le bouton se grise une fois la liste vide : validé au clavier, le focus passe à la suppression du projet.
async function settle(event: MouseEvent, action: () => Promise<void>) {
  const byKeyboard = event.detail === 0
  await action()
  if (!byKeyboard) return
  await nextTick()
  document.querySelector<HTMLElement>('[data-setting="project-delete"] button')?.focus()
}

function archiveChats(event: MouseEvent) {
  settle(event, async () => {
    try {
      const n = await workspace.archiveProjectChats(props.id)
      toasts.push({ kind: 'success', title: t('settings.projects.chats.archived', { n }, n), body: t('settings.projects.chats.archivedBody') })
    } catch (error) {
      toasts.push({ kind: 'error', title: t('settings.projects.chats.archiveFailed'), body: isAppError(error) ? error.message : String(error) })
    }
  })
}

async function deleteChats(event: MouseEvent) {
  const current = project.value
  const n = projectChats.value.length
  if (!current || !n) return
  const confirmed = await dialog.confirm({
    title: t('settings.projects.chats.deleteTitle', { name: current.name }),
    message: t('settings.projects.chats.deleteMessage', { n }, n),
    confirmLabel: t('settings.projects.chats.deleteConfirm'),
    danger: true,
  })
  if (!confirmed) return
  settle(event, async () => {
    await workspace.deleteProjectChats(current.id)
    toasts.push({ kind: 'success', title: t('settings.projects.chats.deleted', { n }, n), body: t('settings.projects.chats.deletedBody') })
  })
}

async function remove(event: MouseEvent) {
  const current = project.value
  if (!current) return
  const byKeyboard = event.detail === 0
  const chats = workspace.tabs.filter((tab) => tab.projectId === current.id && tab.started).length
  const confirmed = await dialog.confirm({
    title: t('settings.projects.deleteTitle', { name: current.name }),
    message: t('settings.projects.deleteMessage', { n: chats }, chats),
    confirmLabel: t('settings.projects.deleteConfirm'),
    danger: true,
  })
  if (!confirmed) return
  const list = projects.projects
  const index = list.findIndex((item) => item.id === current.id)
  const neighbour = list[index + 1] ?? list[index - 1]
  await navigation.showSettingsDetail(null)
  if (navigation.projectId === current.id) navigation.projectId = null
  projects.remove(current.id)
  // Au clavier, le focus passe au projet voisin dans la liste, sinon au bouton d'ajout.
  if (byKeyboard) {
    await nextTick()
    document.querySelector<HTMLElement>(neighbour ? `[data-customize="project:${neighbour.id}"]` : '[data-project-add]')?.focus()
  }
  await workspace.deleteProjectChats(current.id)
}
</script>

<template>
  <p v-if="!project" class="pt-8 text-sm text-muted">{{ t('settings.projects.missing') }}</p>
  <template v-else>
    <SettingsGroup>
      <SettingsRow data-setting="project-name" :label="t('settings.projects.name')">
        <input
          v-model="draft"
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :aria-label="t('settings.projects.name')"
          class="h-7 w-56 min-w-0 rounded-md border border-stroke bg-selection/50 px-2 text-xs outline-none select-text focus:border-stroke-focus"
          @blur="commitName"
          @keydown="onNameKeydown"
        />
      </SettingsRow>
      <SettingsRow data-setting="project-folder" :label="t('settings.projects.folder')">
        <template #hint><span class="font-mono break-all select-text">{{ project.path }}</span></template>
        <div class="flex items-center gap-1">
          <UiIconButton :label="copied ? t('settings.projects.copied') : t('settings.projects.copyPath')" @click="copyPath">
            <component :is="copied ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied }" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton :label="t(revealLabel)" @click="reveal">
            <FolderOpen class="size-3.5" aria-hidden="true" />
          </UiIconButton>
        </div>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup :title="t('settings.projects.look')">
      <SettingsProjectIcon :project="project" />
    </SettingsGroup>

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

    <SettingsGroup v-if="support === 'ready'">
      <SettingsRow
        data-setting="project-worktrees"
        :label="t('settings.projects.worktrees.title')"
        :hint="t('settings.projects.worktrees.count', { n: worktreeCount }, worktreeCount)"
      >
        <UiIconButton
          :label="t('settings.projects.worktrees.open')"
          :data-customize="`worktrees:${project.id}`"
          @click="navigation.showSettingsDetail(`worktrees:${project.id}`)"
        >
          <SlidersHorizontal class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup>
      <SettingsRow data-setting="project-mute" :label="t('settings.projects.notifications')" :hint="muteHint">
        <UiSelect v-model="mute" :label="t('settings.projects.notifications')" :options="muteOptions" />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup>
      <SettingsRow v-slot="{ hintId }" data-setting="project-archive-chats" :label="t('settings.projects.chats.archive')" :hint="t('settings.projects.chats.archiveHint')">
        <UiButton size="sm" :disabled="!activeChats" :aria-describedby="hintId" @click="archiveChats($event)">
          {{ t('settings.projects.chats.archiveButton') }}
        </UiButton>
      </SettingsRow>
      <SettingsRow v-slot="{ hintId }" data-setting="project-delete-chats" :label="t('settings.projects.chats.delete')" :hint="t('settings.projects.chats.deleteHint')">
        <UiButton size="sm" variant="danger" :disabled="!projectChats.length" :aria-describedby="hintId" @click="deleteChats($event)">
          {{ t('settings.projects.chats.deleteButton') }}
        </UiButton>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup>
      <SettingsRow v-slot="{ hintId }" data-setting="project-delete" :label="t('settings.projects.delete')" :hint="t('settings.projects.deleteHint')">
        <UiButton size="sm" variant="danger" :aria-describedby="hintId" @click="remove($event)">{{ t('settings.projects.deleteButton') }}</UiButton>
      </SettingsRow>
    </SettingsGroup>
  </template>
</template>
