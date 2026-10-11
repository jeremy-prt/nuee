import { useI18n } from 'vue-i18n'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import { useConversationsStore } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { useNavigationStore } from '@/stores/navigation'
import { useSkillsStore } from '@/stores/skills'
import { useWorkspaceStore } from '@/stores/workspace'

// Ouvre un chat sans projet qui démarre seul : l'IA crée ou retouche un skill avec l'utilisateur. Le premier
// message ne sert qu'à lancer le tour, les consignes viennent de Rust (ChatCommand).
export function useSkillChat() {
  const { t } = useI18n()
  const dialog = useDialogStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const skills = useSkillsStore()

  return async function skillChat(command: ChatCommand) {
    if (command.kind === 'createSkill') {
      const go = await dialog.confirm({
        title: t('settings.skills.createTitle'),
        message: t('settings.skills.createMessage'),
        confirmLabel: t('settings.skills.createConfirm'),
      })
      if (!go) return
    }
    const prompt =
      command.kind === 'createSkill'
        ? t('chat.commands.createSkillPrompt')
        : t('chat.commands.editSkillPrompt', { name: skills.find(command.id)?.name ?? command.id })
    navigation.openChats(null)
    const tab = workspace.openChat()
    workspace.startChat(tab.id, prompt, [])
    conversations.send(tab.id, null, prompt, [], command)
  }
}
