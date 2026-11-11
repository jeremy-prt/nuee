import { CloudUpload, GitBranchPlus, GitCommit, Rocket } from '@/components/ui/icons'
import { type Component, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useConversationsStore } from '@/stores/conversations'
import { type GitAction, useGitActionsStore } from '@/stores/gitActions'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useSkillsStore } from '@/stores/skills'

export interface GitActionItem {
  id: GitAction
  label: string
  icon: Component
  // Skill de l'utilisateur qui fera l'action (`/j-commit`), affiché à droite dans le menu.
  hint: string | null
  disabled: boolean
}

const ICONS: Record<GitAction, Component> = { ship: Rocket, commitPush: CloudUpload, commit: GitCommit, push: CloudUpload, initRepo: GitBranchPlus }

// Actions git de la session active, mêmes choix et même état dans Environnement et Modifications : l'action
// principale (Shipper si l'utilisateur a un skill de ship, sinon Commiter et pousser), les autres dans le menu.
export function useGitActions() {
  const { t } = useI18n()
  const { chat } = useTerminalChat()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()
  const sessionGit = useSessionGitStore()
  const skills = useSkillsStore()
  const gitActions = useGitActionsStore()

  // Libellés fidèles dès l'ouverture : les skills ne sont sinon lus qu'au premier « / ».
  if (!skills.loaded && !skills.loading) skills.loadSkills()

  const phase = computed(() => (chat.value ? conversations.find(chat.value.id)?.phase : undefined))
  const idle = computed(() => phase.value === 'idle')
  const path = computed(() => projects.byId(chat.value?.projectId ?? null)?.path ?? null)
  const run = computed(() => gitActions.runOf(chat.value))

  // État relu par `ChatPane` entre deux tours ; aussi à l'ouverture du volet, pour un commit fait ailleurs.
  watch(
    [() => chat.value?.id, () => chat.value?.started, path],
    ([id, started, folder]) => {
      if (id && started && folder && idle.value) sessionGit.refresh(id, folder)
    },
    { immediate: true },
  )
  const git = computed(() => (chat.value ? (sessionGit.states[chat.value.id] ?? null) : null))
  const changed = computed(() => (git.value?.changes.files ?? 0) > 0)
  const unpushed = computed(() => !!git.value?.unpushed)

  function item(id: GitAction, enabled: boolean): GitActionItem {
    const skill = chat.value ? gitActions.skillOf(id, chat.value.agent) : null
    return { id, label: gitActions.label(id), icon: ICONS[id], hint: skill ? `/${skill.name}` : null, disabled: !enabled || !!run.value }
  }

  const hasShip = computed(() => !!chat.value && !!gitActions.skillOf('ship', chat.value.agent))
  const main = computed(() => {
    if (changed.value) return item(hasShip.value ? 'ship' : 'commitPush', true)
    if (unpushed.value) return item('push', true)
    return { id: null, label: t('dock.session.nothingToCommit'), icon: GitCommit, hint: null, disabled: true }
  })
  const others = computed(() => {
    if (!changed.value && !unpushed.value) return []
    const list = [hasShip.value && item('ship', changed.value), item('commitPush', changed.value), item('commit', changed.value), item('push', unpushed.value)]
    return list.filter((entry): entry is GitActionItem => !!entry && entry.id !== main.value.id)
  })
  const initRepo = computed(() => item('initRepo', true))

  // `keyboard` : le bouton validé disparaît derrière la ligne « en cours », le focus passe à son bouton d'arrêt.
  async function start(id: GitAction | null, keyboard: boolean, stopSelector: string) {
    if (!id || !chat.value) return
    const started = gitActions.start(id, chat.value)
    if (!keyboard) return
    await nextTick()
    document.querySelector<HTMLElement>(stopSelector)?.focus()
    await started
  }

  return { phase, idle, git, changed, run, main, others, initRepo, start }
}
