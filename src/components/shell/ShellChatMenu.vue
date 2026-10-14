<script setup lang="ts">
import { Archive, Columns2, Copy, Pencil, Pin, PinOff, Trash2 } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import { useConversationsStore } from '@/stores/conversations'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useToastsStore } from '@/stores/toasts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { agents } from '@/utils/agents'
import { transcriptMarkdown } from '@/utils/transcript'

// Contenu du menu d'une session, posé dans son clic droit et dans son bouton « … ».
const props = defineProps<{ tab: Tab }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()
const conversations = useConversationsStore()
const toasts = useToastsStore()

function openBeside() {
  navigation.openChats(props.tab.projectId)
  workspace.openBeside(props.tab.id)
}

// Le résultat ne se voit pas : un message le confirme.
async function copyConversation() {
  const items = await conversations.itemsOf(props.tab.id)
  const text = transcriptMarkdown(items, { user: t('chat.copy.user'), agent: agents[props.tab.agent].name })
  try {
    await navigator.clipboard.writeText(text)
    toasts.push({ kind: 'success', title: t('chats.conversationCopied'), body: t('chats.conversationCopiedBody') })
  } catch {
    toasts.push({ kind: 'error', title: t('chats.copyFailed'), body: '' })
  }
}
</script>

<template>
  <UiMenuItem
    :label="tab.pinned ? t('chats.unpin') : t('chats.pin')"
    :icon="tab.pinned ? PinOff : Pin"
    @select="actions.togglePin(tab)"
  />
  <UiMenuItem :label="t('menu.rename')" :icon="Pencil" :shortcut="shortcuts.label('rename')" @select="emit('rename')" />
  <UiMenuItem :label="t('chats.openBeside')" :icon="Columns2" @select="openBeside" />
  <UiMenuItem :label="t('chats.copyConversation')" :icon="Copy" @select="copyConversation" />
  <UiMenuSeparator />
  <UiMenuItem :label="t('chats.archive')" :icon="Archive" @select="actions.archiveChat(tab)" />
  <UiMenuItem :label="t('chats.delete')" :icon="Trash2" danger @select="actions.deleteChat(tab)" />
</template>
