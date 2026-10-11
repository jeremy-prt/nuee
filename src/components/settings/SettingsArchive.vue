<script setup lang="ts">
import { ArchiveRestore, MessageSquare, Trash2 } from '@lucide/vue'
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { useDialogStore } from '@/stores/dialog'
import { useGeneralStore } from '@/stores/general'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const projects = useProjectsStore()
const dialog = useDialogStore()
const general = useGeneralStore()
const { tabTitle } = useTabTitle()

// Un groupe par projet, dans l'ordre de Réglages › Projets ; les chats sans projet à la fin.
const groups = computed(() => {
  const archived = workspace.archivedChats
  const owners = [...projects.projects.map((project) => ({ id: project.id as string | null, name: project.name })), { id: null, name: t('settings.archive.noProject') }]
  return owners
    .map((owner) => ({ ...owner, chats: archived.filter((tab) => tab.projectId === owner.id) }))
    .filter((group) => group.chats.length)
})

// La ligne disparaît : validé au clavier, le focus passe à la ligne suivante, sinon à la précédente.
async function settle(event: MouseEvent, tab: Tab, action: () => Promise<unknown>) {
  const byKeyboard = event.detail === 0
  const list = workspace.archivedChats
  const index = list.findIndex((item) => item.id === tab.id)
  const neighbour = list[index + 1] ?? list[index - 1]
  await action()
  if (!byKeyboard || !neighbour) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-archive-restore="${neighbour.id}"]`)?.focus()
}

function restore(event: MouseEvent, tab: Tab) {
  settle(event, tab, () => workspace.restoreChat(tab.id))
}

async function remove(event: MouseEvent, tab: Tab) {
  const confirmed =
    !general.confirmDelete ||
    (await dialog.confirm({
      title: t('chats.deleteTitle'),
      message: t('chats.deleteMessage', { title: tabTitle(tab) }),
      confirmLabel: t('chats.deleteConfirm'),
      danger: true,
    }))
  if (confirmed) settle(event, tab, () => workspace.deleteChat(tab.id))
}
</script>

<template>
  <div v-if="!groups.length" data-setting="archive-list" class="mt-8 rounded-xl border border-stroke bg-content/3 px-4 py-5">
    <p class="text-sm font-medium">{{ t('settings.archive.empty') }}</p>
    <p class="mt-0.5 text-xs/relaxed text-muted">{{ t('settings.archive.emptyHint') }}</p>
  </div>
  <template v-else>
    <SettingsGroup v-for="group in groups" :key="group.id ?? ''" :title="group.name" data-setting="archive-list">
      <ul :aria-label="group.name">
        <li v-for="tab in group.chats" :key="tab.id" class="group flex items-center gap-3 border-b border-stroke px-4 py-2 last:border-b-0">
          <MessageSquare class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ tabTitle(tab) }}</span>
          <div class="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
            <UiIconButton :label="t('settings.archive.restore')" :data-archive-restore="tab.id" @click="restore($event, tab)">
              <ArchiveRestore class="size-3.5" aria-hidden="true" />
            </UiIconButton>
            <UiTooltip :label="t('settings.archive.delete')">
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-danger/15 hover:text-danger focus-visible:outline-2 focus-visible:outline-ring"
                :aria-label="t('settings.archive.delete')"
                @click="remove($event, tab)"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
          </div>
        </li>
      </ul>
    </SettingsGroup>
  </template>
</template>
