import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { isAppError } from '@/ipc/agent'
import type { Branch } from '@/ipc/bindings/Branch'
import { worktreeCheckout, worktreeRefs } from '@/ipc/worktree'
import { useProjectsStore } from '@/stores/projects'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'

// Branche de la session active et son changement (Environnement, volet Git). Seul le dossier du projet change de
// branche : un worktree garde la sienne.
export function useSessionBranch() {
  const { t } = useI18n()
  const { chat } = useTerminalChat()
  const projects = useProjectsStore()
  const worktrees = useWorktreesStore()
  const sessionGit = useSessionGitStore()
  const toasts = useToastsStore()

  const project = computed(() => projects.byId(chat.value?.projectId ?? null))
  const branch = computed(() => (chat.value ? worktrees.branchOf(chat.value) : null))
  const canSwitch = computed(() => !!project.value && !!chat.value && !chat.value.worktree && !!branch.value)

  const branches = ref<Branch[]>([])
  async function loadBranches(opened = true) {
    if (!opened || !chat.value || !project.value) return
    try {
      branches.value = (await worktreeRefs(chat.value.id, project.value.path)).branches
    } catch {
      branches.value = []
    }
  }
  // Une branche prise par un worktree n'est pas proposée : git refuse de l'extraire ici.
  const branchList = computed(() =>
    (branches.value.length ? branches.value : branch.value ? [{ name: branch.value, elsewhere: false }] : []).filter((item) => !item.elsewhere),
  )

  async function checkout(name: string) {
    const tab = chat.value
    const current = project.value
    if (!tab || !current || name === branch.value) return
    try {
      await worktreeCheckout(current.path, name)
    } catch (error) {
      toasts.push({ kind: 'error', title: t('composer.branch.checkoutFailed'), body: isAppError(error) ? error.message : String(error) })
    }
    await worktrees.load(current)
    sessionGit.refresh(tab.id, current.path)
  }

  return { branch, canSwitch, branchList, loadBranches, checkout }
}
