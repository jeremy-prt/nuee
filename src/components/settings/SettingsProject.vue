<script setup lang="ts">
import { SlidersHorizontal } from '@/components/ui/icons'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsProjectDefaults from '@/components/settings/SettingsProjectDefaults.vue'
import SettingsProjectFolder from '@/components/settings/SettingsProjectFolder.vue'
import SettingsProjectIcon from '@/components/settings/SettingsProjectIcon.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { isAppError } from '@/ipc/agent'
import { useDialogStore } from '@/stores/dialog'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const projects = useProjectsStore()
const navigation = useNavigationStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const dialog = useDialogStore()
const toasts = useToastsStore()

const project = computed(() => projects.byId(props.id))

// Le dossier a pu changer depuis la dernière lecture : icône relue à chaque ouverture.
watch(project, (current) => current && projects.loadIcon(current, true), { immediate: true })

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

// Absente tant que git n'a pas répondu (ou hors de l'app) : rien n'est bloqué d'avance.
const support = computed(() => projects.support[props.id])
const worktreeReady = computed(() => support.value === undefined || support.value === 'ready')
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

async function archiveChats(event: MouseEvent) {
  const current = project.value
  const n = activeChats.value
  if (!current || !n) return
  const confirmed = await dialog.confirm({
    title: t('settings.projects.chats.archiveTitle', { name: current.name }),
    message: t('settings.projects.chats.archiveMessage', { n }, n),
    confirmLabel: t('settings.projects.chats.archiveConfirm'),
  })
  if (!confirmed) return
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
  navigation.settingsProjectId = neighbour?.id ?? null
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
          data-control
          class="h-7 w-56 min-w-0 rounded-md border border-stroke bg-selection/50 px-2 text-xs outline-none select-text focus:border-stroke-focus"
          @blur="commitName"
          @keydown="onNameKeydown"
        />
      </SettingsRow>
      <SettingsProjectFolder :project="project" />
    </SettingsGroup>

    <SettingsGroup :title="t('settings.projects.look')">
      <SettingsProjectIcon :project="project" />
    </SettingsGroup>

    <SettingsProjectDefaults :id="project.id" />

    <!-- Hors dépôt git, la ligne reste visible et grisée : l'aide dit pourquoi. -->
    <SettingsGroup>
      <SettingsRow
        data-setting="project-worktrees"
        :label="t('settings.projects.worktrees.title')"
        :hint="worktreeReady ? t('settings.projects.worktrees.count', { n: worktreeCount }, worktreeCount) : worktreeHint"
        :disabled="!worktreeReady"
      >
        <UiIconButton
          :label="t('settings.projects.worktrees.open')"
          :disabled="!worktreeReady"
          :data-customize="`worktrees:${project.id}`"
          @click="navigation.showSettingsDetail(`worktrees:${project.id}`)"
        >
          <SlidersHorizontal class="size-3.5" aria-hidden="true" />
        </UiIconButton>
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
