import { useI18n } from 'vue-i18n'
import type { ChatCommand } from '@/ipc/bindings/ChatCommand'
import { useConversationsStore } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { useNavigationStore } from '@/stores/navigation'
import { useSkillsStore } from '@/stores/skills'
import { useWorkspaceStore } from '@/stores/workspace'

// Ouvre un chat sans projet où l'IA crée ou retouche un skill. Nuée y affiche le formulaire elle-même, sans
// tour d'agent : les consignes de Rust (ChatCommand) partent avec la première réponse de l'utilisateur.
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
    const skill = command.kind === 'editSkill' ? skills.find(command.id) : null
    const title =
      command.kind === 'createSkill'
        ? t('chat.commands.createSkill')
        : t('chat.commands.editSkill', { name: skill?.name ?? command.id })
    navigation.openChats(null)
    const tab = workspace.openChat(title)
    workspace.startChat(tab.id, title, [])
    conversations.begin(tab.id, command, skill ? { name: skill.name, description: skill.description, automatic: !skill.manual } : undefined)
  }
}
