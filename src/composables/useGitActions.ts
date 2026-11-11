import { CloudUpload, GitBranchPlus, GitCommit } from '@/components/ui/icons'
import { type Component, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useConversationsStore } from '@/stores/conversations'
import { useGitPanelStore } from '@/stores/gitPanel'
import { type AgentAction, useGitActionsStore } from '@/stores/gitActions'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useSkillsStore } from '@/stores/skills'

export interface GitActionItem {
  label: string
  icon: Component
  disabled: boolean
}

// Actions git de la session active, mêmes choix et même état dans Environnement et le volet Git : commit, push et
// pull directs, faits par l'app (demande de Jérémy, ses skills s'invoquent dans la conversation).
export function useGitActions() {
  const { t } = useI18n()
  const { chat } = useTerminalChat()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()
  const sessionGit = useSessionGitStore()
  const skills = useSkillsStore()
  const gitActions = useGitActionsStore()

  // Les règles du skill de commit servent au message écrit par Haiku : la liste doit être lue.
  if (!skills.loaded && !skills.loading) skills.loadSkills()

  const phase = computed(() => (chat.value ? conversations.find(chat.value.id)?.phase : undefined))
  const idle = computed(() => phase.value === 'idle')
  const path = computed(() => projects.byId(chat.value?.projectId ?? null)?.path ?? null)
  const run = computed(() => gitActions.runOf(chat.value))
  const folder = computed(() => gitActions.folderOf(chat.value))
  const busy = computed(() => !!run.value || (!!folder.value && gitActions.manual.has(folder.value)))

  // État relu par `ChatPane` entre deux tours ; aussi à l'ouverture du volet, pour un commit fait ailleurs.
  watch(
    [() => chat.value?.id, () => chat.value?.started, path],
    ([id, started, root]) => {
      if (id && started && root && idle.value) sessionGit.refresh(id, root)
    },
    { immediate: true },
  )
  const git = computed(() => (chat.value ? (sessionGit.states[chat.value.id] ?? null) : null))
  const changed = computed(() => (git.value?.changes.files ?? 0) > 0)
  const unpushed = computed(() => !!git.value?.unpushed)

  const commit = computed<GitActionItem>(() => ({ label: t('dock.changes.commit'), icon: GitCommit, disabled: !changed.value || busy.value }))
  const push = computed<GitActionItem>(() => ({ label: t('dock.changes.push'), icon: CloudUpload, disabled: !unpushed.value || busy.value }))
  const initRepo = computed(() => ({ label: gitActions.label('initRepo'), icon: GitBranchPlus, disabled: busy.value }))

  // `keyboard` : le bouton validé disparaît derrière la ligne « en cours », le focus passe à son bouton d'arrêt.
  async function start(id: AgentAction, keyboard: boolean, stopSelector: string, commitAfter = false) {
    if (!chat.value) return
    const started = gitActions.start(id, chat.value, commitAfter)
    if (!keyboard) return
    await nextTick()
    document.querySelector<HTMLElement>(stopSelector)?.focus()
    await started
  }

  // Commit : champ du volet Git rempli, ce message ; sinon Haiku l'écrit puis l'app commite.
  function runCommit(keyboard: boolean, stopSelector: string) {
    if (!chat.value || commit.value.disabled) return
    const message = useGitPanelStore().of(chat.value.id).message
    if (message.trim()) return gitActions.commitNow(chat.value, message)
    return start('message', keyboard, stopSelector, true)
  }

  return { phase, idle, git, changed, unpushed, busy, run, commit, push, initRepo, start, runCommit }
}
