<script setup lang="ts">
import { Archive, Columns2, Pencil, Pin, PinOff, Trash2 } from '@/components/ui/icons'
import { useI18n } from 'vue-i18n'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import { useNavigationStore } from '@/stores/navigation'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Contenu du menu d'une session, posé dans son clic droit et dans son bouton « … ».
const props = defineProps<{ tab: Tab }>()
const emit = defineEmits<{ rename: [] }>()

const { t } = useI18n()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const actions = useProjectActions()

function openBeside() {
  navigation.openChats(props.tab.projectId)
  workspace.openBeside(props.tab.id)
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
  <UiMenuSeparator />
  <UiMenuItem :label="t('chats.archive')" :icon="Archive" @select="actions.archiveChat(tab)" />
  <UiMenuItem :label="t('chats.delete')" :icon="Trash2" danger @select="actions.deleteChat(tab)" />
</template>
