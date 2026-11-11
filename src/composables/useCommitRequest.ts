import { computed } from 'vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { i18nGlobal } from '@/i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useConversationsStore } from '@/stores/conversations'
import { useOperatorStore } from '@/stores/operator'
import { useSkillsStore } from '@/stores/skills'

// Le skill de commit de l'utilisateur s'il en a un (le sien commite puis pousse), sinon la demande générique. Liste
// relue à chaque demande, comme le menu « / » : un skill ajouté entre-temps est vu.
async function commitPrompt(agent: AgentKind, push: boolean) {
  const skills = useSkillsStore()
  await skills.loadSkills()
  const skill = skills.commitSkill(agent)
  return skill ? `/${skill.name}` : i18nGlobal().t(push ? 'dock.session.commitPushPrompt' : 'dock.session.commitPrompt')
}

// Demandes git faites à l'agent de la session active (jamais lancées par Nuée), depuis Environnement et Modifications.
export function useCommitRequest() {
  const { chat, place } = useTerminalChat()
  const conversations = useConversationsStore()
  const operator = useOperatorStore()

  const phase = computed(() => (chat.value ? conversations.find(chat.value.id)?.phase : undefined))

  async function request(prompt: (agent: AgentKind) => string | Promise<string>) {
    const tab = chat.value
    if (!tab || !place.value || phase.value !== 'idle') return
    const text = await prompt(tab.agent)
    if (chat.value?.id !== tab.id || !place.value || phase.value !== 'idle') return
    operator.userSpoke(tab.id)
    conversations.send(tab.id, place.value, text, [])
  }

  const commit = () => request((agent) => commitPrompt(agent, false))
  const commitAndPush = () => request((agent) => commitPrompt(agent, true))
  // Sans le skill : celui de l'utilisateur pousse toujours.
  const commitOnly = () => request(() => i18nGlobal().t('dock.session.commitOnlyPrompt'))
  const push = () => request(() => i18nGlobal().t('dock.changes.pushPrompt'))

  return { phase, commit, commitAndPush, commitOnly, push }
}
